# API Fuzz Test Report
Generated: 7/3/2026, 3:41:48 PM

## Summary
| Metric | Count |
|--------|-------|
| Total Fuzz Tests | 15 |
| Anomalies Found | 0 |
| Server Crashes (5xx) | 0 |
| Timeouts | 0 |
| Stack Trace Leaks | 0 |

---

## 🔴 Anomalies Found (0)
_None_

---

## 📊 Endpoint Summary
### GET /catalogue/a-light-in-the-attic_1000/index.html ✓
- Status codes observed: 200
- Tests run: 1
- Anomalies: 0

### GET /catalogue/category/books_1/index.html ✓
- Status codes observed: 200
- Tests run: 2
- Anomalies: 0

### GET /catalogue/category/books/historical-fiction_4/index.html ✓
- Status codes observed: 200
- Tests run: 2
- Anomalies: 0

### GET /catalogue/category/books/mystery_3/index.html ✓
- Status codes observed: 200
- Tests run: 2
- Anomalies: 0

### GET /catalogue/category/books/sequential-art_5/index.html ✓
- Status codes observed: 200
- Tests run: 2
- Anomalies: 0

### GET /catalogue/category/books/travel_2/index.html ✓
- Status codes observed: 200
- Tests run: 2
- Anomalies: 0

### GET /index.html ✓
- Status codes observed: 200
- Tests run: 2
- Anomalies: 0

### GET / ✓
- Status codes observed: 200
- Tests run: 2
- Anomalies: 0

---

## 🤖 AI Analysis
[analysis not generated]

---

## ✅ Clean Results
- TC-FUZZ-001-A: GET /catalogue/a-light-in-the-attic_1000/index.html with valid observed ID → 200
- TC-FUZZ-002-A: GET /catalogue/category/books_1/index.html with valid observed ID → 200
- TC-FUZZ-003-A: GET /catalogue/category/books_1/index.html with valid observed ID → 200
- TC-FUZZ-004-A: GET /catalogue/category/books/historical-fiction_4/index.html with valid observed ID → 200
- TC-FUZZ-005-A: GET /catalogue/category/books/historical-fiction_4/index.html with valid observed ID → 200
- TC-FUZZ-006-A: GET /catalogue/category/books/mystery_3/index.html with valid observed ID → 200
- TC-FUZZ-007-A: GET /catalogue/category/books/mystery_3/index.html with valid observed ID → 200
- TC-FUZZ-008-A: GET /catalogue/category/books/sequential-art_5/index.html with valid observed ID → 200
- TC-FUZZ-009-A: GET /catalogue/category/books/sequential-art_5/index.html with valid observed ID → 200
- TC-FUZZ-010-A: GET /catalogue/category/books/travel_2/index.html with valid observed ID → 200
- TC-FUZZ-011-A: GET /catalogue/category/books/travel_2/index.html with valid observed ID → 200
- TC-FUZZ-012-A: GET /index.html with valid observed ID → 200
- TC-FUZZ-013-A: GET /index.html with valid observed ID → 200
- TC-FUZZ-014-A: GET / with valid observed ID → 200
- TC-FUZZ-015-A: GET / with valid observed ID → 200
