### src/llm/embedding.ts:44
The Gemini API key fallback uses `process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY`, but there's no validation to ensure at least one key is present. If both are undefined, the client will be created with an undefined API key, which will fail at runtime. Consider adding explicit validation or handling the missing key scenario.
```suggestion
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Gemini API key is missing. Please set GEMINI_API_KEY or GOOGLE_API_KEY in the environment.'
    );
  }

  const google = createGoogleGenerativeAI({
    apiKey,
```


### src/context/session.ts:122
The embedding is stored as a JSON string in the VSS table, but the rowid used for insertion is `historyId` (which equals the history table's id). This creates a coupling where VSS rowids must match history IDs. If there's ever a mismatch or if VSS has internal rowid constraints, this could cause issues. Consider using the last_insert_rowid() from the VSS insert instead of assuming it matches historyId.
```suggestion
        'INSERT INTO history_vss(embedding) VALUES (?)'
      );
      const vssResult = vssStmt.run(JSON.stringify(embedding));
      const vssRowid = vssResult.lastInsertRowid as number;
      
      // Map history ID to VSS rowid
      const mapStmt = this.db.prepare(
        'INSERT INTO history_embeddings (history_id, vss_rowid) VALUES (?, ?)'
      );
      mapStmt.run(historyId, vssRowid);
```


### src/context/session.ts:125
Embedding failures are caught and logged to console.error, but this will disrupt the CLI output and potentially confuse users. Consider using a debug logger or silent logging mechanism that's consistent with the application's logging strategy.


### src/context/session.ts:226
The score normalization logic has potential issues when all results have the same score. If all FTS results have identical BM25 scores, maxFtsScore will be that value, and normalization will produce the same score for all entries. More critically, if there are no FTS results but the fallback `Math.max(...[], 1)` is used, maxFtsScore is 1, which may not correctly normalize subsequent scores. Consider handling edge cases where result arrays are empty or have uniform scores.
```suggestion
    const maxFtsScore = ftsResults.length > 0
      ? Math.max(...ftsResults.map(r => Math.abs(r.score)))
      : 0;
    for (const r of ftsResults) {
      const normalizedFtsScore = maxFtsScore > 0
        ? 1 - (Math.abs(r.score) / maxFtsScore) // BM25 is negative, lower is better
        : 1;
      resultMap.set(r.id, {
        ...r,
        score: normalizedFtsScore,
        source: 'hybrid'
      });
    }

    // Merge semantic results (distance, lower is better)
    const maxSemanticScore = semanticResults.length > 0
      ? Math.max(...semanticResults.map(r => r.score))
      : 0;
    for (const r of semanticResults) {
      const existing = resultMap.get(r.id);
      const normalizedScore = maxSemanticScore > 0
        ? 1 - (r.score / maxSemanticScore)
        : 1;
```


### src/rag/engine.ts:205
The preferred command lookup doesn't check if the preferred command's documentation actually exists before adding the note. If `preferredCmd` has no man page but `cmd` does, this will result in no documentation being added at all, even though documentation for the original command exists. Consider falling back to the original command's documentation if the preferred command has none.


### src/rag/engine.ts:208
The terminal history check includes 'history' as a keyword, which could be problematic. If a user asks "what's the history of Linux?", this would trigger terminal history inclusion even though the query is not about terminal commands. Consider using more specific terminal-related keywords or combining with other heuristics.
```suggestion
    const terminalKeywords = [
      'run',
      'command',
      'terminal',
      'shell',
      'execute',
      'sudo',
      'command history',
      'shell history',
      'terminal history',
    ];
```


### src/context/session.ts:191
The limit parameter is directly interpolated into the SQL string in the vss_search_params function call. While this comes from a function parameter with a default value, it should be passed as a parameterized query to prevent potential SQL injection if the limit parameter is ever sourced from user input. Use a placeholder and pass it as a parameter instead.
```suggestion
          WHERE vss_search(embedding, vss_search_params(?, ?))
        ) AS vss
        JOIN history_embeddings he ON he.vss_rowid = vss.rowid
        JOIN history h ON h.id = he.history_id
        ORDER BY vss.distance
      `);
      
      const results = stmt.all(JSON.stringify(queryEmbedding), limit) as (SessionEntry & { score: number })[];
```


### src/llm/embedding.ts:38
The API key retrieval for OpenAI doesn't validate if the API key is present before creating the client. If OPENAI_API_KEY is not set, this will fail at runtime when the embedding is requested. Consider adding validation similar to the Gemini provider or handling the error case explicitly.
```suggestion
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    const openai = createOpenAI({ apiKey });
```


### src/rag/engine.ts:242
The file keywords check includes generic words like 'open', 'read', 'create', and 'delete' which could match many non-file-related queries. For example, "how do I create a user?" or "delete all processes" would incorrectly trigger file context inclusion. Consider using more specific file-related terms or combining keywords with other context clues.
```suggestion
    const fileKeywords = [
      'file',
      'files',
      'filename',
      'filepath',
      'directory',
      'folder',
      'path',
      'list files',
      'list directory',
      'list folders'
    ];
    const lowerQuery = query.toLowerCase();
    const mentionsFileConcept = fileKeywords.some(kw => lowerQuery.includes(kw));
    // Treat explicit paths or filenames (with / or \) as file-related as well
    const mentionsPathLike = lowerQuery.includes('/') || lowerQuery.includes('\\');
    const isFileQuery = mentionsFileConcept || mentionsPathLike;
```


### src/index.ts:219
The explicit `process.exit(0)` forces immediate termination, which may not allow async cleanup operations to complete. If there are pending database writes (like the embedding generation in addEntry), they could be interrupted. Consider using graceful shutdown or ensuring all async operations complete before exiting.


### src/context/session.ts:230
The boost calculation for items found by both search methods adds 0.2 to the average score: `(existing.score + normalizedScore) / 2 + 0.2`. This could push scores above 1.0, which may cause issues if downstream code expects normalized scores in the 0-1 range. Consider capping the final score at 1.0 or using a different boosting strategy that maintains the normalized range.
```suggestion
        // Boost items found by both methods, while keeping score in [0, 1]
        existing.score = Math.min(1, (existing.score + normalizedScore) / 2 + 0.2);
```


### src/context/session.ts:87
The SQL injection protection via parameterized queries is correctly implemented for the limit parameter. However, the embedding dimension is directly interpolated into the SQL string in the CREATE VIRTUAL TABLE statement. While this value comes from a controlled function, it's worth noting that if getEmbeddingDimension() ever returns non-numeric input, this could be problematic. Consider adding type validation or using a constant.


### src/rag/engine.ts:173
The word count check `query.trim().split(/\s+/).length <= 3` will incorrectly classify very short queries as follow-ups even when they're not. For example, "list all files" or "show me processes" are 3 words but are standalone queries, not follow-ups. This heuristic may result in including unnecessary history context for short but complete queries, increasing token usage unnecessarily.
```suggestion
    // Very short queries are often follow-ups; restrict this to 1–2 words
    const wordCount = query.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount <= 2) {
```


### src/index.ts:171
The variable name `ragInitialized` could be more descriptive. Since it specifically tracks whether RAG initialization has occurred to avoid duplicate initialization, consider renaming it to `isRagInitialized` to follow boolean naming conventions.


### src/rag/engine.ts:222
The comment "Use hybrid search for better relevance" doesn't explain what hybrid search is or how it differs from the previous approach. Since this is a key architectural change, consider adding more detailed documentation about how the hybrid search combines FTS5 and semantic search, and what benefits it provides.
```suggestion
      // Use hybrid search over session history:
      // - Combines fast keyword/FTS5 matching with semantic similarity search
      //   so we retrieve both exact term matches and paraphrased/related turns.
      // - This replaces earlier recency/keyword-only heuristics with a single
      //   ranked result set, improving recall and relevance for follow-up queries.
```


### TODO.md:21
Several TODO items in the "Context Retrieval & Usage Improvements" section have been addressed by this PR's implementation of hybrid search and selective context loading, particularly the items about RAG, semantic search, and selective context inclusion based on query type. Consider marking these items as completed and moving them to the Completed section per the instructions in the file.


### src/context/session.ts:6
Unused import cosineSimilarity.
```suggestion
import { getEmbedding, getEmbeddingDimension } from '../llm/embedding.js';
```


