"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isLocalMode, getLocalQuizByCode, getLocalQuestions, getLocalUser } from "@/lib/local";
import { Quiz, Question, QuizAttempt } from "@/lib/types";
import { Clock, Send, CheckCircle, AlertCircle, User, WifiOff, Save } from "lucide-react";
import { BrandMark, BrandSpinner } from "@/components/Logo";
import { QuestionFigure } from "@/components/QuestionFigure";
import { groupQuestions, printsContext } from "@/lib/question-groups";
import { useToast } from "@/components/ui/toast";
import { formatTime } from "@/lib/utils";
import { useOffline } from "@/lib/use-offline";
import { readJsonResponse } from "@/lib/keep-alive-client";
import {
  flushPendingAttempts,
  getQuizBundleByCode,
  getQuizBundleById,
  gradeOffline,
  queuePendingAttempt,
  saveQuizBundle,
  warmQuizPage,
} from "@/lib/offline-quiz";
import type { TheoryGrade } from "@/lib/ai/theory-grader";

/**
 * True/false answers are stored as "true"/"false" and typed answers as their
 * text; only the first needs prettifying for display.
 */
/**
 * Local copy of an unsubmitted theory paper.
 *
 * Theory answers have to reach the AI to be marked, so when the device is
 * offline the attempt cannot be handed in. The answers are kept on this device
 * instead, tied to the quiz and the signed-in account, and offered back when
 * the student returns.
 */
const THEORY_DRAFT_PREFIX = "ollin_theory_draft";

type TheoryDraft = { answers: Record<string, string>; savedAt: string };

const answerText = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (value === "true") return "True";
  if (value === "false") return "False";
  return String(value);
};

/**
 * The countdown owns its own ticking state. Because the page never re-renders
 * on a tick, the question list and its figures stay untouched for the whole
 * quiz — the previous design re-rendered every card once a second.
 */
function Countdown({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds);
  // The callback is read through a ref inside the interval, so a new identity
  // on every answer never restarts the countdown.
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  });

  useEffect(() => {
    // Deadline, not a decrement: a throttled background tab would otherwise
    // drift, and a resumed attempt must keep its real remaining time.
    const end = Date.now() + seconds * 1000;
    let fired = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0 && !fired) {
        fired = true;
        expireRef.current();
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Clock className={`w-4 h-4 ${left < 60 ? "animate-pulse" : ""}`} />
      <span className={left < 60 ? "text-red-600 font-bold" : ""}>{formatTime(left)}</span>
    </div>
  );
}

export default function QuizPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const guestName = searchParams.get("guest");
  // Practice run: opened from Test quizzes, not from a shared link. These
  // attempts are graded in the browser's session only — nothing is written to
  // the quiz's record, so the quiz's creator never receives the participant's
  // name or score.
  const isPractice = searchParams.get("practice") === "1";
  const router = useRouter();
  const supabase = createClient();

  const isGuest = !!guestName;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [joined, setJoined] = useState(false);
  const [participantName, setParticipantName] = useState(guestName || "");
  const [currentUser, setCurrentUser] = useState<{ name: string; email?: string | null; isGuest: boolean } | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);


  const [answers, setAnswers] = useState<Record<string, string>>({});
  // The countdown lives inside <Countdown>, which owns its own ticking state.
  // Keeping it here re-rendered every question card (and its figure) once a
  // second for the whole quiz. Only the deadline is needed here, and only to
  // report elapsed time when the student hands in.
  const [initialSeconds, setInitialSeconds] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Terminal submit rejection (time up / closed / duplicate) — shows a
  // resolution screen; the quiz UI is no longer reachable or retryable.
  const [rejection, setRejection] = useState<{ message: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null);
  const [results, setResults] = useState<{
    score: number;
    total: number;
    correct: number;
    detailed: Array<{ question: Question; selected: string | null; isCorrect: boolean }>;
  } | null>(null);

  const autoJoiningRef = useRef(false);
  // Server-trusted attempt start: the moment the quiz UI was joined.
  const joinedAtRef = useRef<string | null>(null);
  const toast = useToast();

  const offline = useOffline();

  // A result marked here while offline is filed the moment the connection
  // returns, without waiting for a trip to the dashboard.
  useEffect(() => {
    const flush = () => {
      flushPendingAttempts().catch(() => {});
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  // A theory answer is prose that only the AI can mark, so a paper containing
  // one cannot be handed in without a connection.
  const hasTheory = questions.some((q) => q.question_type === "theory");
  const [theoryMarks, setTheoryMarks] = useState<Record<string, TheoryGrade>>({});
  // A paper saved on this device while offline, offered back on return.
  const [savedDraft, setSavedDraft] = useState<TheoryDraft | null>(null);
  // The paper's own answer key, kept on this device so an offline submission
  // can be marked on the spot. Null until a copy that carries answers loads.
  const [gradeSource, setGradeSource] = useState<Question[] | null>(null);
  // True when the result on screen was marked offline and is still waiting to
  // be filed with the server.
  const [queuedOffline, setQueuedOffline] = useState(false);

  const draftStorageKey = useCallback(
    () =>
      `${THEORY_DRAFT_PREFIX}:${quiz?.id || code}:${
        currentUser?.email || participantName || "guest"
      }`,
    [quiz?.id, code, currentUser?.email, participantName]
  );

  /** Keep an unsubmittable theory paper on this device. */
  const saveForLater = useCallback(() => {
    if (!quiz) return;
    const payload: TheoryDraft = { answers, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(draftStorageKey(), JSON.stringify(payload));
      setSavedDraft(null);
      toast.success(
        "Answers saved on this device. Come back online and submit them from this quiz."
      );
    } catch {
      toast.error(
        "Could not save your answers on this device — storage may be full. Keep this page open."
      );
    }
  }, [answers, draftStorageKey, quiz, toast]);

  // Offer a saved paper back once the quiz is loaded and nobody has submitted.
  useEffect(() => {
    if (!quiz || questions.length === 0 || submitted) return;
    try {
      const raw = localStorage.getItem(draftStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as TheoryDraft;
      if (parsed?.answers && Object.keys(parsed.answers).length > 0) setSavedDraft(parsed);
    } catch { /* corrupt draft — treat as none */ }
  }, [quiz, questions.length, submitted, draftStorageKey]);

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      if (guestName) {
        setCurrentUser({ name: guestName, isGuest: true });
        return;
      }
      if (isLocalMode()) {
        const localUser = getLocalUser();
        if (localUser) {
          setCurrentUser({ name: localUser.full_name, email: localUser.email, isGuest: false });
          setParticipantName(localUser.full_name);
        }
        return;
      }
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          const name = data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "Student";
          setCurrentUser({ name, email: data.user.email, isGuest: false });
          setParticipantName(name);
        }
      }
    };
    checkUser();
  }, [guestName, supabase]);

  // Entry check + auto-join, in one place: a logged-in student who already
  // completed this quiz gets their result screen instead of the quiz (the
  // server rejects duplicate submissions at submit time, so failing early
  // saves them from answering everything only to be told "already taken").
  // Everyone else auto-joins only AFTER the check resolves — never before.
  const [alreadyTaken, setAlreadyTaken] = useState<{ score_percentage: number } | null>(null);
  const [attemptResolved, setAttemptResolved] = useState(false);
  useEffect(() => {
    if (!quiz || joined || loading) return;
    // Practice runs are not recorded, so there is no "already taken" to find.
    if (isPractice) {
      setAttemptResolved(true);
      return;
    }
    // Guests with a URL name have no account to check — join immediately.
    if (isGuest && guestName) {
      setAttemptResolved(true);
      if (!autoJoiningRef.current) {
        autoJoiningRef.current = true;
        handleJoin();
      }
      return;
    }
    if (!currentUser || currentUser.isGuest) return;
    let cancelled = false;
    (async () => {
      let found: { score_percentage: number } | null = null;
      try {
        if (isLocalMode()) {
          const res = await fetch("/api/attempts?mine=true");
          if (res.ok) {
            const data = await res.json();
            const match = (data.attempts || []).find(
              (a: { quiz_id: string; status: string }) => a.quiz_id === quiz.id && a.status === "completed"
            );
            if (match) found = { score_percentage: match.score_percentage ?? 0 };
          }
        } else if (supabase) {
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) {
            const { data } = await supabase
              .from("quiz_attempts")
              .select("score_percentage")
              .eq("quiz_id", quiz.id)
              .eq("participant_id", userData.user.id)
              .eq("status", "completed")
              .limit(1);
            if (data && data.length) found = { score_percentage: data[0].score_percentage ?? 0 };
          }
        }
      } catch { /* fail open — the server still blocks duplicate submits */ }
      if (cancelled) return;
      if (found) {
        setAlreadyTaken(found);
      } else if (!autoJoiningRef.current) {
        autoJoiningRef.current = true;
        handleJoin();
      }
      setAttemptResolved(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz?.id, currentUser?.email, joined, loading]);

  /** Store this paper (questions + answer key) on the device for offline use. */
  const keepOfflineCopy = useCallback(async (quizCode: string) => {
    try {
      const res = await fetch(`/api/quizzes/${encodeURIComponent(quizCode)}?include=offline`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.quiz || data.quiz.status === "draft" || !Array.isArray(data.questions)) return;
      if (saveQuizBundle({ quiz: data.quiz, questions: data.questions, savedAt: new Date().toISOString() })) {
        setGradeSource(data.questions);
        // Keep the screen itself too, so the link opens offline as well.
        warmQuizPage(data.quiz.share_code || quizCode);
      }
    } catch { /* offline: nothing to refresh */ }
  }, []);

  useEffect(() => {
    const fetchQuiz = async () => {
      // Always try the public API first (works for guests, local, and logged-in users)
      let unreachable = false;
      try {
        const res = await fetch(`/api/quizzes/${code}`);
        if (res.ok) {
          const data = await res.json();
          if (data.quiz && data.quiz.status !== "draft") {
            setQuiz(data.quiz);
            setQuestions(data.questions || []);
            setLoading(false);
            keepOfflineCopy(code);
            return;
          } else if (data.quiz) {
            setError("This quiz is not published yet.");
            setLoading(false);
            return;
          }
        }
      } catch { unreachable = true; }

      // No connection: take the copy saved on this device. It carries the
      // questions AND their answer key, so the paper can still be marked here.
      if (unreachable) {
        const bundle = getQuizBundleByCode(code);
        if (bundle) {
          setQuiz(bundle.quiz);
          setQuestions(bundle.questions);
          setGradeSource(bundle.questions);
          setLoading(false);
          return;
        }
      }

      // Try local mode localStorage
      if (isLocalMode()) {
        const localQuiz = getLocalQuizByCode(code);
        if (localQuiz && localQuiz.status !== "draft") {
          // Local rows already carry their answers, so this paper is markable
          // offline as it stands — and is kept for next time.
          const localQuestions = getLocalQuestions(localQuiz.id);
          setQuiz(localQuiz);
          setQuestions(localQuestions);
          setGradeSource(localQuestions);
          saveQuizBundle({
            quiz: localQuiz,
            questions: localQuestions,
            savedAt: new Date().toISOString(),
          });
        } else if (localQuiz) {
          setError("This quiz is not published yet.");
        } else {
          setError("Quiz not found. Check the code and try again.");
        }
        setLoading(false);
        return;
      }

      // Try Supabase
      if (supabase) {
        const { data, error: fetchError } = await supabase
          .from("quizzes").select("*").eq("share_code", code).single();

        if (!fetchError && data) {
          if (data.status === "draft") {
            setError("This quiz is not published yet.");
            setLoading(false);
            return;
          }
          setQuiz(data);
          const { data: qData } = await supabase
            .from("questions").select("*").eq("quiz_id", data.id).order("order_index");
          if (qData) {
            setQuestions(qData);
            // This fallback reads the full rows, so it is markable offline too.
            setGradeSource(qData);
          }
          setLoading(false);
          return;
        }
      }

      setError("Quiz not found. Check the code and try again.");
      setLoading(false);
    };
    fetchQuiz();
  }, [code, supabase, keepOfflineCopy]);

  useEffect(() => {
    if (joined && quiz?.time_limit_minutes && deadlineRef.current === null) {
      // Resume-aware: if we hold a server attempt with a real start time
      // (fresh join OR a resumed attempt), remaining time is measured from
      // THAT moment — a refreshed page never gets fresh time back.
      let remaining = quiz.time_limit_minutes * 60;
      const startedIso = attempt?.started_at || joinedAtRef.current;
      const startedMs = startedIso ? new Date(startedIso).getTime() : NaN;
      if (!Number.isNaN(startedMs) && startedMs > 0) {
        remaining = Math.max(0, Math.floor(remaining - (Date.now() - startedMs) / 1000));
      }
      deadlineRef.current = Date.now() + remaining * 1000;
      setInitialSeconds(remaining);
    }
  }, [joined, quiz, attempt]);

  // Answers are kept for refresh-recovery. Writing the whole map on every
  // keystroke is a synchronous storage write per character — felt as a lagging
  // input on a phone — so writes are debounced, with a final flush on unmount
  // that covers closing the tab mid-edit.
  const saveStateRef = useRef<{ key: string; answers: Record<string, string>; skip: boolean }>({
    key: "",
    answers: {},
    skip: false,
  });
  useEffect(() => {
    saveStateRef.current = {
      key: quiz ? `quiz_${quiz.id}_answers` : "",
      answers,
      skip: submitted,
    };
  }, [quiz, answers, submitted]);
  useEffect(() => {
    if (!joined || !quiz) return;
    const key = `quiz_${quiz.id}_answers`;
    const id = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(answers)); } catch { /* storage full */ }
    }, 400);
    return () => clearTimeout(id);
  }, [answers, joined, quiz]);
  useEffect(() => () => {
    const { key, answers: last, skip } = saveStateRef.current;
    if (!key || skip || !Object.keys(last).length) return;
    try { localStorage.setItem(key, JSON.stringify(last)); } catch { /* storage full */ }
  }, []);

  useEffect(() => {
    if (joined && quiz) {
      const key = `quiz_${quiz.id}_answers`;
      const saved = localStorage.getItem(key);
      if (saved) { try { setAnswers(JSON.parse(saved)); } catch {} }
    }
  }, [joined, quiz]);

  const handleJoin = async () => {
    if (!participantName.trim()) return;
    if (alreadyTaken) return; // entry check owns this state

    // Practice: no attempt row, no server-side record of who is taking it.
    if (isPractice) {
      joinedAtRef.current = new Date().toISOString();
      setJoined(true);
      return;
    }

    if (isGuest || isLocalMode()) {
      joinedAtRef.current = new Date().toISOString();
      // Record the start server-side so the time limit survives page
      // refreshes — otherwise a student could reset their timer forever.
      try {
        const res = await fetch("/api/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quiz_id: quiz!.id,
            participant_name: participantName || "Guest",
            status: "in_progress",
          }),
        });
        if (res.ok) {
          const d = await res.json();
          if (d.attempt?.id) setAttempt(d.attempt);
        }
      } catch { /* server will still grade on submit */ }
      setJoined(true);
      return;
    }

    if (supabase) {
      try {
        const { data, error } = await supabase.from("quiz_attempts").insert({
          quiz_id: quiz!.id,
          participant_name: participantName.trim(),
          total_questions: questions.length,
          status: "in_progress",
        }).select().single();

        if (!error) {
          setAttempt(data);
        }
      } catch {
        // Offline: there is no attempt row yet. One is created when the
        // result is filed, so the student can start straight away.
      }
    }
    joinedAtRef.current = new Date().toISOString();
    setJoined(true);
  };

  const handleSubmit = useCallback(async () => {
    if (submitting || submitted || !quiz || !questions.length) return;
    // Theory answers must reach the AI to be marked, so handing them in while
    // offline would only fail after the attempt was already spent. Point the
    // student at the local copy instead.
    if (offline && hasTheory) {
      toast.error(
        "You're offline, so this paper can't be submitted — theory answers have to be marked by AI. Save your answers for later."
      );
      return;
    }
    // ── Offline: mark here, file later ─────────────────────
    // The copy saved on this device carries the answer key, so the paper can
    // be marked on the spot and the result shown straight away. A recorded
    // attempt (not a practice run) is queued and posted to the server — which
    // re-grades it — the next time there is a connection.
    if (offline) {
      const markingKey = gradeSource ?? getQuizBundleById(quiz.id)?.questions ?? null;
      if (!markingKey || markingKey.length === 0) {
        toast.error(
          "This quiz isn't saved on this device, so it can't be marked offline. Reconnect, open it once, then try again."
        );
        return;
      }
      setSubmitting(true);
      const submittedAt = new Date().toISOString();
      const timeTaken =
        quiz.time_limit_minutes && deadlineRef.current
          ? Math.max(
              0,
              quiz.time_limit_minutes * 60 -
                Math.round((deadlineRef.current - Date.now()) / 1000)
            )
          : null;
      const graded = gradeOffline(markingKey, answers);
      if (!isPractice) {
        queuePendingAttempt({
          quizId: quiz.id,
          quizCode: quiz.share_code,
          participantName: participantName || currentUser?.name || "Anonymous",
          participantEmail: currentUser?.email || null,
          startedAt: attempt?.started_at || joinedAtRef.current || submittedAt,
          submittedAt,
          timeTakenSeconds: timeTaken,
          answers: questions.map((q) => ({
            question_id: q.id,
            selected_answer: answers[q.id] || "",
          })),
          score: graded.score,
        });
      }
      try { localStorage.removeItem(`quiz_${quiz.id}_answers`); } catch { /* storage */ }
      try { localStorage.removeItem(draftStorageKey()); } catch { /* storage */ }
      setQueuedOffline(!isPractice);
      setTheoryMarks({});
      setResults({
        score: graded.score,
        total: graded.total,
        correct: graded.correct,
        detailed: graded.detailed,
      });
      setSubmitted(true);
      setSubmitting(false);
      return;
    }

    setSubmitting(true);

    // ── Server-side grading ────────────────────────────────
    // Correct answers never reach the browser, so the server computes the
    // score. The client only renders what the server returns — participants
    // can't grade their own submission or fake their score.
    const attemptId = attempt?.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    // The server's own record of when this attempt started (from the
    // in_progress row) is authoritative over anything the client claims —
    // a refreshed page would otherwise report a fresh start time.
    const startedAt = attempt?.started_at || joinedAtRef.current || new Date().toISOString();
    // Stamped at the click, before the request goes anywhere: the server records
    // this as when the quiz was handed in, so a slow connection doesn't turn an
    // on-time submission into a late one.
    const submittedAt = new Date().toISOString();
    const timeTaken =
      quiz.time_limit_minutes && deadlineRef.current
        ? Math.max(
            0,
            quiz.time_limit_minutes * 60 -
              Math.round((deadlineRef.current - Date.now()) / 1000)
          )
        : null;

    let score = 0;
    let correct = 0;
    let detailed: Array<{ question: any; selected: string | null; isCorrect: boolean }> = [];

    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(isLocalMode() ? { "x-local-mode": "true" } : {}) },
        body: JSON.stringify({
          quiz_id: quiz.id,
          participant_name: participantName || "Anonymous",
          participant_email: currentUser?.email || null,
          time_taken_seconds: timeTaken,
          started_at: startedAt,
          submitted_at: submittedAt,
          practice: isPractice,
          answers: questions.map((q) => ({
            question_id: q.id,
            selected_answer: answers[q.id] || "",
          })),
        }),
      });
      // Theory marking streams through the keep-alive envelope: the request
      // stays open while the AI compares each prose answer to its model answer.
      const { ok, data: raw } = await readJsonResponse(res);
      const data = raw as {
        error?: string;
        attempt?: { score_percentage?: number; correct_answers?: number };
        theory?: unknown;
        answers?: Array<{ question_id: string; is_correct: boolean; selected_answer: string }>;
        answer_key?: Record<string, string>;
        explanations?: Record<string, string | null>;
      };
      if (!ok) throw new Error(data.error || "Failed to submit quiz");
      if (data.theory && typeof data.theory === "object") {
        setTheoryMarks(data.theory as Record<string, TheoryGrade>);
      }

      score = data.attempt?.score_percentage ?? 0;
      correct = data.attempt?.correct_answers ?? 0;
      // My attempts is cached for the tab; this attempt must appear in it
      // immediately, so the stale list is dropped before the student navigates.
      import("@/lib/prefetch")
        .then(({ invalidateResource }) => invalidateResource("my-attempts"))
        .catch(() => {});

      // Build the review from server-graded answers + answer key fetched
      // AFTER grading (the graded response includes the correct answers).
      const gradedMap: Record<string, { is_correct: boolean; selected_answer: string }> = {};
      for (const a of data.answers || []) {
        gradedMap[a.question_id] = { is_correct: a.is_correct, selected_answer: a.selected_answer };
      }
      // The submit response may include the answer key for review; if not,
      // fetch it from the graded endpoint.
      let keyByQ: Record<string, string> = {};
      if (data.answer_key) {
        keyByQ = data.answer_key;
      } else {
        try {
          const kRes = await fetch(`/api/attempts/${attemptId}/review`, {
            headers: isLocalMode() ? { "x-local-mode": "true" } : {},
          });
          if (kRes.ok) {
            const kData = await kRes.json();
            for (const item of kData.review || []) {
              keyByQ[item.question_id] = item.correct_answer;
            }
          }
        } catch { /* review optional */ }
      }

      detailed = questions.map((q) => ({
        question: { ...q, correct_answer: keyByQ[q.id] ?? "", explanation: (data.explanations || {})[q.id] ?? null },
        selected: gradedMap[q.id]?.selected_answer || answers[q.id] || null,
        isCorrect: !!gradedMap[q.id]?.is_correct,
      }));
    } catch (err) {
      // Grading failed. Surface the server's reason (e.g. "Time is up",
      // "You have already taken this quiz") rather than a generic error.
      const msg = err instanceof Error && err.message ? err.message : "Could not submit your quiz. Check your connection and try again.";
      // Terminal rejections (time up / quiz closed / duplicate) leave the
      // submit button failing forever, so hand the student a resolution
      // screen instead of leaving them trapped in the quiz UI. Network-type
      // failures stay retryable with the toast + button.
      const terminal = /time is up|has closed|not open yet|already taken/i.test(msg);
      if (terminal) {
        setRejection({ message: msg });
        if (isLocalMode() && /time is up/i.test(msg) && quiz) {
          // Mark the attempt timed out so My attempts / the admin roster
          // can distinguish "missed the deadline" from "never showed up".
          // Server-side: My attempts reads the server record, not
          // localStorage, and the route replaces the in_progress row.
          try {
            await fetch(`/api/attempts`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(isLocalMode() ? { "x-local-mode": "true" } : {}) },
              body: JSON.stringify({
                quiz_id: quiz.id,
                participant_name: participantName || currentUser?.name || "Anonymous",
                participant_email: currentUser?.email || null,
                status: "timed_out",
                completed_at: new Date().toISOString(),
                time_taken_seconds: quiz.time_limit_minutes ? quiz.time_limit_minutes * 60 : null,
                total_questions: questions.length,
                answers,
              }),
            });
          } catch { /* best-effort record */ }
          // Also mirror into localStorage for offline guest review.
          try {
            const { saveLocalAttempt } = await import("@/lib/local");
            const localUser = getLocalUser();
            saveLocalAttempt({
              id: attemptId,
              quiz_id: quiz.id,
              participant_email: localUser?.email || currentUser?.email || null,
              participant_name: participantName || "Anonymous",
              score_percentage: 0,
              correct_answers: 0,
              total_questions: questions.length,
              time_taken_seconds: timeTaken,
              answers,
              status: "timed_out",
              completed_at: new Date().toISOString(),
            });
          } catch { /* best-effort record */ }
        }
        return;
      }
      toast.error(msg);
      setSubmitting(false);
      return;
    }

    // Mirror the graded result into localStorage for local mode (My Attempts)
    if (isLocalMode()) {
      const { saveLocalAttempt } = await import("@/lib/local");
      const localUser = getLocalUser();
      saveLocalAttempt({
        id: attemptId,
        quiz_id: quiz.id,
        participant_email: localUser?.email || currentUser?.email || null,
        participant_name: participantName || "Anonymous",
        score_percentage: score,
        correct_answers: correct,
        total_questions: questions.length,
        time_taken_seconds: timeTaken,
        answers,
        status: "completed",
        completed_at: new Date().toISOString(),
      });
      // Results surface on the creator's dashboard charts — no notification here.
    }

    localStorage.removeItem(`quiz_${quiz.id}_answers`);
    // The paper is submitted, so the offline copy must not be offered again.
    try {
      localStorage.removeItem(draftStorageKey());
    } catch { /* storage unavailable */ }

    setResults({ score, total: questions.length, correct, detailed });
    setSubmitted(true);
    setSubmitting(false);

    // Fetch the participant's standing on this quiz (best-effort)
    try {
      const lbRes = await fetch(`/api/quizzes/${quiz.id}/leaderboard`);
      if (lbRes.ok) {
        const lb = await lbRes.json();
        if (lb.your_rank != null) {
          setRank({ rank: lb.your_rank, total: lb.total_attempts });
        }
      }
    } catch { /* leaderboard optional */ }
  }, [submitting, submitted, quiz, questions, answers, attempt, isGuest, participantName, supabase, currentUser, offline, hasTheory, draftStorageKey, gradeSource, isPractice, toast]);

  // Auto-join for guests with a URL name happens inside the entry check.
  // Logged-in users never see a separate auto-join effect — the check itself
  // joins them when clean, which removes the stale-state race entirely.

  // ─── Conditional renders (ALL hooks declared above) ───

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="app-topbar">
          <div className="app-column h-16 flex items-center gap-2">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <BrandSpinner className="brand-spinner-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="app-topbar">
          <div className="app-column h-16 flex items-center gap-2">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="app-card p-8 max-w-md text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-[#333] mb-2">Quiz unavailable</h1>
            <p className="text-sm text-[#666] mb-4">{error}</p>
            <Link href="/join" className="btn-primary text-sm">Try another code</Link>
          </div>
        </div>
      </div>
    );
  }

  // Entry-check-in-progress: logged-in user whose duplicate check hasn't
  // resolved yet (they either join or see the taken screen right after).
  if (currentUser && !currentUser.isGuest && !attemptResolved && !joined) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="app-topbar">
          <div className="app-column h-16 flex items-center gap-2">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <BrandSpinner className="brand-spinner-lg" />
        </div>
      </div>
    );
  }

  // Terminal rejection — time up, quiz closed, or duplicate. The student
  // gets a way out instead of a submit button that fails forever.
  if (rejection) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="app-topbar">
          <div className="app-column h-16 flex items-center gap-2">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="app-card p-8 max-w-md text-center">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h1 className="text-lg font-semibold text-[#333] mb-2">Submission not accepted</h1>
            <p className="text-sm text-[#666] mb-5">{rejection.message}</p>
            <p className="text-xs text-[#999] mb-5">
              If you think this is a mistake (e.g. you lost connection near the end), message the admin from the Help desk.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/dashboard/attempts" className="btn-primary text-sm">My attempts</Link>
              <Link href="/support" className="text-sm text-[#666] hover:text-[#333] px-3 py-2">Help desk</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Already taken — the student completed this quiz before; no retake.
  if (alreadyTaken && !joined) {
    const passed = alreadyTaken.score_percentage >= (quiz?.passing_score || 50);
    return (
      <div className="min-h-screen flex flex-col">
        <header className="app-topbar">
          <div className="app-column h-16 flex items-center gap-2">
            <BrandMark />
            <span className="brand-word">Ollin</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="app-card p-8 max-w-md text-center">
            <CheckCircle className={`w-12 h-12 mx-auto mb-3 ${passed ? "text-green-600" : "text-amber-500"}`} />
            <h1 className="text-lg font-semibold text-[#333] mb-1">You have already taken this quiz</h1>
            <p className="text-sm text-[#666] mb-4">
              Your score: <span className="font-semibold text-[#333]">{alreadyTaken.score_percentage}%</span>
              {quiz && <> on “{quiz.title}”</>}. Each student gets one attempt.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/dashboard/attempts" className="btn-primary text-sm">View my attempts</Link>
              <Link href="/dashboard" className="text-sm text-[#666] hover:text-[#333] px-3 py-2">Dashboard</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Join screen
  if (!joined) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="app-topbar">
          <div className="app-column h-16 flex items-center">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <BrandMark />
              <span className="brand-word">Ollin</span>
            </Link>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            <div className="app-card p-5">
              <h1 className="text-xl font-extrabold text-[var(--ink)] mb-0.5">{quiz!.title}</h1>

              <div className="bg-[var(--surface-2)] rounded-2xl p-4 my-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-[var(--ink-muted)]">Questions</span>
                  <span className="font-medium text-[#333]">{questions.length}</span>
                </div>
                {quiz!.time_limit_minutes && (
                  <div className="flex justify-between">
                    <span className="text-[#666]">Time limit</span>
                    <span className="font-medium text-[#333]">{quiz!.time_limit_minutes} mins</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#666]">Passing score</span>
                  <span className="font-medium text-[#333]">{quiz!.passing_score}%</span>
                </div>
                {quiz!.starts_at && (
                  <div className="flex justify-between">
                    <span className="text-[#666]">Opens</span>
                    <span className="font-medium text-[#333]">{new Date(quiz!.starts_at).toLocaleString()}</span>
                  </div>
                )}
                {quiz!.ends_at && (
                  <div className="flex justify-between">
                    <span className="text-[#666]">Closes</span>
                    <span className="font-medium text-[#333]">{new Date(quiz!.ends_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {quiz!.starts_at && Date.now() < new Date(quiz!.starts_at).getTime() && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800 mb-4">
                  This quiz is not open yet. It opens {new Date(quiz!.starts_at).toLocaleString()}.
                </div>
              )}
              {quiz!.ends_at && Date.now() > new Date(quiz!.ends_at).getTime() && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mb-4">
                  This quiz has closed. It closed {new Date(quiz!.ends_at).toLocaleString()}.
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-[#333] mb-1.5">Your name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999] pointer-events-none" />
                  <input
                    id="participant-name-input"
                    type="text"
                    value={participantName}
                    onChange={(e) => setParticipantName(e.target.value)}
                    placeholder="Enter your name"
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <button
                id="start-quiz-btn"
                onClick={handleJoin}
                disabled={
                  !participantName.trim() ||
                  !!(quiz!.starts_at && Date.now() < new Date(quiz!.starts_at).getTime()) ||
                  !!(quiz!.ends_at && Date.now() > new Date(quiz!.ends_at).getTime())
                }
                className="btn-primary w-full min-h-[48px] text-[15px] transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
              >
                Start quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Results screen
  if (submitted && results) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="app-topbar">
          <div className="app-column h-16 flex items-center gap-2">
            <BrandMark />
            <span className="brand-word">Ollin</span>
            <span className="text-xs font-semibold text-[var(--ink-muted)] ml-1">Quiz complete</span>
          </div>
        </header>
        <main className="flex-1 px-4 py-6">
          <div className="max-w-md mx-auto">
            <div className="app-card p-6 mb-5 text-center">
              <div className={`w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl font-bold ${
                results.score >= quiz!.passing_score
                  ? "bg-green-50 text-green-700 border-2 border-green-200"
                  : "bg-red-50 text-red-700 border-2 border-red-200"
              }`}>
                {results.score}%
              </div>
              <h2 className="text-lg font-bold text-[var(--ink)] mb-1">
                {results.score >= quiz!.passing_score ? "Passed!" : "Not passed"}
              </h2>
              <p className="text-sm text-[var(--ink-muted)]">
                {results.correct} out of {results.total} correct
              </p>
              {hasTheory && (
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  Theory answers were marked by AI against the model answer.
                </p>
              )}
              {isGuest && (
                <p className="text-xs text-[#999] mt-2">
                  Your results were not saved. Log in to track your progress.
                </p>
              )}
              {queuedOffline && (
                <p className="text-xs text-[#7a4b00] bg-[#fdf4e3] border border-[#f0d9a8] rounded p-2 mt-2 text-left">
                  Marked on this device while you were offline. Your result is sent to Ollin
                  automatically the next time you&apos;re online.
                </p>
              )}
              {rank && (
                <p className="text-xs text-[#666] mt-2">
                  Ranked <span className="font-semibold text-[#006633]">#{rank.rank}</span>
                  {rank.total > 1 ? ` of ${rank.total}` : ""} on this quiz
                </p>
              )}
            </div>

            <h3 className="text-sm font-bold text-[var(--ink)] mb-3">Review answers</h3>
            <div className="space-y-3">
              {results.detailed.map((item, idx) => (
                <div
                  key={idx}
                  className={`bg-white border rounded-lg p-4 ${
                    item.isCorrect ? "border-green-200" : "border-red-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      item.isCorrect ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {item.isCorrect ? "✓" : "✗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#333] mb-2">{item.question.question_text}</p>
                      {item.question.preamble && (
                        <p className="text-xs text-[#555] leading-relaxed whitespace-pre-line border-l-2 border-[#0d6b3d] bg-[#f7f9f8] pl-2 pr-2 py-1.5 rounded-r mb-2">
                          {item.question.preamble}
                        </p>
                      )}
                      <QuestionFigure figure={item.question.figure} />

                      {item.question.options ? (
                        <div className="space-y-1 mb-2">
                          {item.question.options.map((opt, optIdx) => {
                            const isSelected = item.selected === String(optIdx);
                            const isCorrectOpt = String(optIdx) === item.question.correct_answer;
                            return (
                              <div
                                key={optIdx}
                                className={`text-xs px-3 py-1.5 rounded border ${
                                  isCorrectOpt
                                    ? "bg-green-50 border-green-200 text-green-700"
                                    : isSelected && !isCorrectOpt
                                    ? "bg-red-50 border-red-200 text-red-700"
                                    : "bg-[#f8f8f8] border-[#e0e0e0] text-[#666]"
                                }`}
                              >
                                {String.fromCharCode(65 + optIdx)}. {opt}
                                {isCorrectOpt && " ✓"}
                                {isSelected && !isCorrectOpt && " ✗"}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        // True/false questions have no options array — show the
                        // picked and correct answers as text.
                        <div className="space-y-1 mb-2">
                          {[["Your answer", answerText(item.selected), !!item.isCorrect], ["Correct answer", answerText(item.question.correct_answer), true]].map(([label, value, good]) => (
                            <div key={label as string} className={`text-xs px-3 py-1.5 rounded border ${
                              good ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
                            }`}>
                              {label}: <span className="font-medium">{value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.question.explanation && item.question.question_type !== "theory" && (
                        <p className="text-xs text-[#666] bg-[#f8f8f8] rounded p-2 mt-1">
                          <span className="font-medium">Explanation:</span> {item.question.explanation}
                        </p>
                      )}

                      {/* Theory marking: how close the answer was, what it hit
                          and missed, the full explanation, and the steps. */}
                      {item.question.question_type === "theory" && (() => {
                        const mark = theoryMarks[item.question.id];
                        if (!mark) return null;
                        return (
                          <div className="mt-2 rounded border border-[#cfe3d7] bg-[#f5f9f7] p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-[#0d6b3d]">
                                {mark.graded ? "Marked by AI" : "Awaiting review"}
                              </span>
                              {mark.graded && (
                                <span className="text-[#666] tabular-nums">
                                  {mark.marks}/{item.question.marks || 1} marks · {mark.closeness}% close
                                </span>
                              )}
                            </div>

                            {mark.feedback && (
                              <p className="text-xs text-[#444]">{mark.feedback}</p>
                            )}

                            {mark.matchedPoints.length > 0 && (
                              <p className="text-xs text-green-800">
                                <span className="font-medium">Covered:</span>{" "}
                                {mark.matchedPoints.join("; ")}
                              </p>
                            )}
                            {mark.missedPoints.length > 0 && (
                              <p className="text-xs text-amber-800">
                                <span className="font-medium">Missed:</span>{" "}
                                {mark.missedPoints.join("; ")}
                              </p>
                            )}

                            {mark.explanation && (
                              <div className="text-xs text-[#444]">
                                <span className="font-medium">The full answer:</span>{" "}
                                {mark.explanation}
                              </div>
                            )}

                            {mark.steps.length > 0 && (
                              <div className="text-xs text-[#444]">
                                <span className="font-medium">Steps to the answer:</span>
                                <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                                  {mark.steps.map((step, si) => (
                                    <li key={si}>{step}</li>
                                  ))}
                                </ol>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center mt-6">
              <Link href="/dashboard" className="btn-primary text-sm">Close</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Quiz in progress — all questions in one scrollable page
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  // Consecutive questions sharing a case are presented under one printed
  // passage instead of repeating it on every card.
  const groups = groupQuestions(questions);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass-strong sticky top-0 z-50">
        <div className="app-column h-14 flex items-center justify-between">
          <span className="text-sm font-medium truncate">{quiz!.title}</span>
          <div className="flex items-center gap-3">
            {initialSeconds !== null && (
              <Countdown seconds={initialSeconds} onExpire={handleSubmit} />
            )}
            <span className="text-xs text-[var(--ink-muted)] bg-[var(--surface-2)] border border-[var(--border)] px-2 py-0.5 rounded">
              {answeredCount}/{questions.length} answered
            </span>
          </div>
        </div>
        {/* Sticky progress bar — fills as questions are answered, always visible */}
        <div className="app-column pb-2">
          <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] rounded-full transition-all duration-300 ease-out"
              style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <div className="app-column space-y-3">
          {/* A saved paper, offered back rather than restored silently. */}
          {savedDraft && (
            <div className="app-card p-4 border-l-4 border-amber-400">
              <p className="text-sm font-semibold text-[#333]">You have saved answers for this paper</p>
              <p className="text-xs text-[#666] mt-1">
                Saved on {new Date(savedDraft.savedAt).toLocaleString()}. Restore them to carry on,
                or discard them and start fresh.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, ...savedDraft.answers }));
                    setSavedDraft(null);
                    toast.success("Saved answers restored.");
                  }}
                  className="btn-primary text-xs px-3 min-h-[36px]"
                >
                  Restore answers
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try { localStorage.removeItem(draftStorageKey()); } catch { /* ignore */ }
                    setSavedDraft(null);
                  }}
                  className="text-xs px-3 min-h-[36px] rounded border border-[#e0e0e0] text-[#666]"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* Offline: a theory paper cannot be handed in, because the answers
              have to reach the AI to be marked. */}
          {offline && hasTheory && (
            <div
              role="status"
              className="app-card p-4 border-l-4 border-[#c98a00] bg-[#fdf4e3]"
            >
              <p className="text-sm font-semibold text-[#7a4b00] flex items-center gap-1.5">
                <WifiOff className="w-4 h-4 shrink-0" /> You&apos;re offline
              </p>
              <p className="text-xs text-[#7a4b00] mt-1">
                This paper contains theory questions, which the AI marks when you submit — so it
                can&apos;t be handed in until you&apos;re back online. Your answers can be saved on
                this device and submitted later.
              </p>
              <button
                type="button"
                onClick={saveForLater}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-3 min-h-[36px] rounded border border-[#c98a00] text-[#7a4b00] bg-white"
              >
                <Save className="w-3.5 h-3.5" /> Save answers for later
              </button>
            </div>
          )}

          {/* Offline with a paper that needs no AI: it is marked here. */}
          {offline && !hasTheory && (
            <div role="status" className="app-card p-4 border-l-4 border-[#0d6b3d] bg-[#f2f8f4]">
              <p className="text-sm font-semibold text-[#0d6b3d] flex items-center gap-1.5">
                <WifiOff className="w-4 h-4 shrink-0" /> Offline — this quiz is saved on your device
              </p>
              <p className="text-xs text-[#3f5a4a] mt-1">
                Answer as usual and press Submit. The paper is marked here, and your result is
                sent to Ollin when you reconnect.
              </p>
            </div>
          )}

          {questions.map((q, idx) => {
            const group = groups.get(q.id);
            const showContext = !!(q.preamble && printsContext(group));
            return (
            <Fragment key={q.id}>
            {group && group.leader && group.size > 1 && (
              <div className="app-card p-4 sm:p-5 border-l-4 border-[#0d6b3d]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0d6b3d] mb-1.5">
                  Questions {idx + 1}–{idx + group.size} refer to this
                </p>
                <p className="text-sm text-[#444] leading-relaxed whitespace-pre-line">
                  {q.preamble}
                </p>
              </div>
            )}
            <div className="app-card p-4 sm:p-5">
              <div className="flex items-start gap-3 mb-3">
                <span className="w-6 h-6 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="text-[15px] sm:text-sm font-medium text-[#333] leading-snug">{q.question_text}</p>
              </div>

              {/* The passage or case the question is built on (see above when
                  it is shared with the questions around it). */}
              {showContext && (
                <p className="sm:ml-9 mb-3 text-sm text-[#555] leading-relaxed whitespace-pre-line border-l-2 border-[#0d6b3d] bg-[#f7f9f8] pl-3 pr-2 py-2 rounded-r">
                  {q.preamble}
                </p>
              )}

              {/* The data the question refers to, drawn from its own values. */}
              {q.figure && (
                <div className="sm:ml-9 mb-3">
                  <QuestionFigure figure={q.figure} />
                </div>
              )}

              {/* Branch on the question's type, not on whether it happens to
                  carry options: a fill-in-the-blank or short-answer question has
                  none, and used to fall through to the True/False buttons. */}
              {q.question_type === "theory" ? (
                <div className="sm:ml-9">
                  <textarea
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Write your answer — explain the reasoning, not just the conclusion"
                    aria-label={`Answer for question ${idx + 1}`}
                    rows={6}
                    maxLength={4000}
                    className="input-field w-full text-[15px] sm:text-sm resize-y"
                  />
                  <div className="flex items-center justify-between text-[10px] text-[var(--ink-faint)] mt-1">
                    <span>Theory answer · marked by AI against the model answer</span>
                    <span className="tabular-nums">{(answers[q.id] || "").length}/4000</span>
                  </div>
                </div>
              ) : q.question_type === "short_answer" || q.question_type === "fill_blank" ? (
                <div className="sm:ml-9">
                  <input
                    type="text"
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Type your answer"
                    aria-label={`Answer for question ${idx + 1}`}
                    autoComplete="off"
                    className="input-field w-full min-h-[44px] text-[15px] sm:text-sm"
                  />
                </div>
              ) : q.options && q.options.length > 0 ? (
                <div className="space-y-2.5 sm:ml-9">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = answers[q.id] === String(optIdx);
                    return (
                      <button
                        key={optIdx}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: String(optIdx) }))}
                        aria-pressed={isSelected}
                        className={`w-full min-h-[44px] text-left px-4 py-2.5 rounded-lg border text-[15px] sm:text-sm flex items-center justify-between gap-2 transition-all duration-150 active:scale-[0.98] ${
                          isSelected
                            ? "border-[#006633] bg-green-50 text-[#006633] font-medium shadow-sm"
                            : "border-[#e0e0e0] bg-white text-[#333] hover:border-[#ccc]"
                        }`}
                      >
                        <span>
                          <span className="font-medium mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                          {opt}
                        </span>
                        <span
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all duration-150 ${
                            isSelected ? "bg-[#006633] border-[#006633]" : "border-[#ccc]"
                          }`}
                        >
                          {isSelected && (
                            <svg viewBox="0 0 16 16" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 8.5 6.5 12 13 4.5" />
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Whatever is left is true/false — render the two canonical
                // answers (stored as "true"/"false").
                <div className="flex gap-2.5 sm:ml-9">
                  {["true", "false"].map((val) => {
                    const isSelected = answers[q.id] === val;
                    return (
                      <button
                        key={val}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                        aria-pressed={isSelected}
                        className={`flex-1 sm:flex-none min-h-[44px] px-6 rounded-lg border text-[15px] sm:text-sm transition-all duration-150 active:scale-[0.98] ${
                          isSelected
                            ? "border-[#006633] bg-green-50 text-[#006633] font-medium shadow-sm"
                            : "border-[#e0e0e0] bg-white text-[#333] hover:border-[#ccc]"
                        }`}
                      >
                        {val === "true" ? "True" : "False"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </Fragment>
            );
          })}

          <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] sm:pb-3 bg-white/95 backdrop-blur border-t border-[#e0e0e0] flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || answeredCount === 0 || (offline && hasTheory)}
              className="btn-primary w-full sm:w-auto gap-2 text-[15px] sm:text-sm px-8 min-h-[48px] shadow-lg disabled:opacity-50 transition-all duration-150 active:scale-[0.98]"
            >
              <Send className="w-4 h-4" />
              {submitting
                ? hasTheory
                  ? "Submitting and marking…"
                  : "Submitting..."
                : offline && hasTheory
                  ? "Offline — cannot submit"
                  : offline
                    ? `Submit and mark offline (${answeredCount}/${questions.length})`
                    : `Submit (${answeredCount}/${questions.length})`}
            </button>
            {offline && hasTheory && (
              <button
                type="button"
                onClick={saveForLater}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm px-6 min-h-[48px] rounded-lg border border-[#c98a00] text-[#7a4b00] bg-white"
              >
                <Save className="w-4 h-4" /> Save for later
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
