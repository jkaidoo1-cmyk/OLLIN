/**
 * Curated exemplar questions — the "training data" for question setting.
 *
 * The app calls hosted chat models: Groq's `openai/gpt-oss-20b` and Gemini
 * through the AI Studio OpenAI-compatible endpoint. Neither can be trained
 * from here:
 *   - Groq exposes a fine-tuning API, but it is closed beta and serves
 *     PRE-MADE LoRA adapters for inference only ("we do not provide LoRA
 *     fine-tuning services") — the adapter must be trained elsewhere.
 *   - Google retired fine-tuning from the Gemini API / AI Studio when
 *     1.5 Flash-001 was deprecated in May 2025; it now lives on Vertex AI.
 *
 * So the model is steered with in-context exemplars instead: a small, fixed
 * set of high-quality questions that defines the standard for every
 * generation request. Keep this block compact — it is prepended to every
 * generation call, so each extra token is paid on every quiz created.
 */

/**
 * The rubric a question has to satisfy. Stated separately from the examples so
 * the model has both a rule and a demonstration of the rule.
 */
export const QUESTION_STANDARD = `The standard is a printed university exam, not a chatbot quiz.

Stem: one complete, specific sentence that stands alone. Name the thing being
tested and the situation or quantity it applies to. Banned openings and shapes:
"According to the text/passage", "How does X relate to Y", "What is the primary
role of X", "Which of the following", "What is X best described as", "Why is X
important", "What does X refer to", and any stem that only asks the student to
recall a phrase from the material. Never join two questions with "and", never
stack a clause that gives away the answer.

Distractors: each is a mistake a real student makes — a common misconception, a
reversed cause and effect, a confusion with a closely related term, an off-by-one
or wrong unit. Never nonsense, never a near-duplicate of the right answer, never
"all/none/both of the above", never two options that are both correct, never one
option absurdly longer or vaguer than the others.

Options: exactly four (true/false: two), similar length and grammatical form —
all noun phrases or all full clauses — equally specific, and the correct option's
position must vary across the set.

Explanation: the mechanism or rule that makes the answer right, in one sentence.
Never "as stated in the material".

Before returning, check every item: answerable from the material alone; no two
items test the same fact; the key is unambiguously right and the other three
unambiguously wrong; a subject teacher would accept it as a fair exam question.
An item that fails the check is dropped, not padded.`;

/**
 * High-quality samples in the exact response schema. Drawn from familiar
 * subjects so the model copies the *standard*, not the content — the prompt
 * tells it explicitly not to reuse them.
 */
export const QUESTION_EXEMPLARS = `{"questions":[
{"type":"multiple_choice","question":"Why does oxidative phosphorylation yield far more ATP per glucose than glycolysis does?","options":[
"It splits each glucose molecule into two three-carbon chains",
"It couples electron transport to proton pumping across the inner membrane",
"It regenerates NAD+ so that glycolysis can continue without oxygen",
"It converts pyruvate directly into ATP inside the mitochondrial matrix"],"correctAnswer":"1","answerKey":"It couples electron transport to proton pumping across the inner membrane","explanation":"The electron transport chain builds the proton gradient ATP synthase uses."},
{"type":"multiple_choice","question":"A cell is placed in a solution whose solute concentration equals its own. What happens to its volume?","options":[
"It shrinks as water leaves through the membrane",
"It stays constant because net water movement is zero",
"It swells until the membrane ruptures",
"It shrinks until solute concentrations match"],"correctAnswer":"1","answerKey":"It stays constant because net water movement is zero","explanation":"Equal concentrations mean no net osmosis in either direction."},
{"type":"multiple_choice","question":"Which change shifts an exothermic equilibrium reaction toward its products?","options":[
"Raising the temperature of the reaction mixture",
"Adding a catalyst that lowers the activation energy",
"Lowering the temperature of the reaction mixture",
"Increasing the pressure by halving the vessel volume"],"correctAnswer":"2","answerKey":"Lowering the temperature of the reaction mixture","explanation":"Removing heat favours the direction that releases heat."},
{"type":"multiple_choice","question":"A hash table at load factor 0.95 degrades toward linear search mainly because","options":[
"keys are rehashed on every lookup once the table is full",
"collision chains and probe sequences grow longer as slots fill",
"the hash function stops distributing keys above 90% occupancy",
"memory reclamation stalls the table while it grows"],"correctAnswer":"1","answerKey":"collision chains and probe sequences grow longer as slots fill","explanation":"Fewer free slots means more collisions per lookup."},
{"type":"true_false","question":"In TCP, a sender reduces its congestion window after detecting packet loss.","options":["True","False"],"correctAnswer":"true","answerKey":"True","explanation":"Loss is read as congestion, so the sender backs off."},
{"type":"fill_blank","question":"The enzyme that unwinds the DNA double helix ahead of replication is called ______.","correctAnswer":"helicase","answerKey":"helicase","explanation":"Helicase breaks the hydrogen bonds between base pairs."}
]}`;
