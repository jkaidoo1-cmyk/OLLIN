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
export const QUESTION_STANDARD = `A good question tests exactly one idea from the material and has one defensible answer.
Every distractor is a plausible mistake — a common misconception, a reversed
cause and effect, or a confusion with a closely related term — never a nonsense
option, "all of the above", or a near-duplicate of the right answer. Options are
similar in length and grammatical form, and the question never just restates the
material's wording or asks "according to the text".`;

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
{"type":"multiple_choice","question":"Which change shifts an exothermic equilibrium reaction toward its products?","options":[
"Raising the temperature of the reaction mixture",
"Adding a catalyst that lowers the activation energy",
"Lowering the temperature of the reaction mixture",
"Increasing the pressure by halving the vessel volume"],"correctAnswer":"2","answerKey":"Lowering the temperature of the reaction mixture","explanation":"Removing heat favours the direction that releases heat."},
{"type":"multiple_choice","question":"Why does a hash table's average lookup time degrade toward linear search as its load factor approaches one?","options":[
"Keys are rehashed on every lookup once the table is full",
"Collision chains and probe sequences grow longer as slots fill up",
"The hash function stops distributing keys once entries exceed slots",
"Memory reclamation stalls the table while it grows"],
"correctAnswer":"1","answerKey":"Collision chains and probe sequences grow longer as slots fill up","explanation":"Fewer free slots means more collisions per lookup."},
{"type":"true_false","question":"In TCP, a sender reduces its congestion window after detecting packet loss.","options":["True","False"],"correctAnswer":"true","answerKey":"True","explanation":"Loss is read as congestion, so the sender backs off."},
{"type":"fill_blank","question":"The enzyme that unwinds the DNA double helix ahead of replication is called ______.","correctAnswer":"helicase","answerKey":"helicase","explanation":"Helicase breaks the hydrogen bonds between base pairs."}
]}`;
