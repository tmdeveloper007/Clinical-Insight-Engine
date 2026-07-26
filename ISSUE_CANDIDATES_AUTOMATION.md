# Issue Candidates

1. Title: test : add unit tests for safe_csv_reader module
   Type: test
   Files: services/safe_csv_reader.py, tests/test_safe_csv_reader.py
   Summary: Add pytest coverage for the SafeCSVReader which wraps pandas CSV reading with resource guards, validation, and sanitization. Tests cover happy path, resource exhaustion, malformed CSVs, and memory limits.
   Verification: python3 -m pytest tests/test_safe_csv_reader.py -v
   Conflict risk: low

2. Title: test : add unit tests for PredictionLRUCache class
   Type: test
   Files: app/ml/prediction_cache.py, tests/test_prediction_cache.py
   Summary: Add pytest coverage for the PredictionLRUCache module which provides a thread-safe LRU cache with TTL for ML inference results. Tests cover get/set/eviction/TTL/hit-rate stats.
   Verification: python3 -m pytest tests/test_prediction_cache.py -v
   Conflict risk: low

3. Title: test : add unit tests for phi_redaction middleware
   Type: test
   Files: app/middleware/phi_redaction.py, tests/test_phi_redaction_middleware.py
   Summary: Add pytest coverage for the phi_redaction_middleware decorator which redacts PHI from dict, list, and string arguments before passing to the wrapped function. Tests cover dict redaction, list redaction, string redaction, and non-PHI params bypass.
   Verification: python3 -m pytest tests/test_phi_redaction_middleware.py -v
   Conflict risk: low

4. Title: test : add unit tests for ML model_loader module
   Type: test
   Files: app/ml/model_loader.py, tests/test_model_loader.py
   Summary: Add pytest coverage for the model_loader module which provides singleton caching with thread-safe double-checked locking for ML model loading. Tests cover singleton cache, clear_cache, get_model, and thread-safety.
   Verification: python3 -m pytest tests/test_model_loader.py -v
   Conflict risk: low

5. Title: test : add vitest tests for errorResponse schema
   Type: test
   Files: shared/schemas/errorResponse.ts, shared/schemas/errorResponse.test.ts
   Summary: Add vitest coverage for the errorResponseSchema Zod validation and createErrorResponse helper function. Tests cover valid/invalid schema shapes and UUID validation for requestId.
   Verification: npx vitest run --project=server shared/schemas/errorResponse.test.ts
   Conflict risk: low
