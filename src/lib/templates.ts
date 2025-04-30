export const defaultSummaryTemplate = `
# 📄 Transcript Summary

**Title:** {{title}}
**Date:** {{date}}
**Speaker(s):** {{speakers}}
**Context:** {{context}}
**Location / Platform:** {{location_or_platform}}

---

## 🧭 Overview

{{summary_overview}}

---

## 🗂️ Key Topics

1. **{{topic_1_title}}**
   - {{point_1}}
   - {{point_2}}

2. **{{topic_2_title}}**
   - {{point_1}}
   - {{point_2}}

*...continue for more topics...*

---

## ✅ Key Takeaways

- {{takeaway_1}}
- {{takeaway_2}}
- {{takeaway_3}}

---

## 📋 Action Points (if applicable)

| Action | Assigned To | Deadline |
|--------|-------------|----------|
| {{action_1}} | {{person_1}} | {{due_date_1}} |
| {{action_2}} | {{person_2}} | {{due_date_2}} |

---

## 🗒️ Additional Notes

{{extra_notes}}
`;