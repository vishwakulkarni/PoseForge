-- generation_characters holds every reference image of a generation, not only
-- the guided Studio's up-to-four people: Advanced Studio image generators
-- record each connected image here, and engines accept up to 16 (OpenAI,
-- Dreamina GPT Image). The 1-4 bound from 006 made any Advanced generation
-- with more than four references fail after its files were prepared.
-- tests/advancedWorkflowRuns.test.js checks this bound against the engines.
ALTER TABLE generation_characters DROP CONSTRAINT generation_characters_position_check;
ALTER TABLE generation_characters ADD CONSTRAINT generation_characters_position_check CHECK (position BETWEEN 1 AND 16);
