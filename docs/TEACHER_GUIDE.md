# Teacher guide

Today highlights your assigned classes, schedule, pending grading, published work, and upcoming exams. Your class workspace links students, assignments, exams, lessons, resources, announcements, and schedule.

## Assignments

Create a draft with instructions, availability, due date, maximum score, and late policy. Attach a supported file if needed. Review before publishing; publication locks the instructions and configuration. Students submit once. Open submissions, assign a score within the maximum, and save privately or return the result. Students see only returned feedback and scores. Mark the assignment complete after all received submissions have been returned.

## Exams

Create a subject question bank. Multiple-choice options are a JSON array of distinct text values; the correct answer must exactly match one choice. True/false answers use `true` or `false`. Short-answer, image, and equation questions use text responses and manual grading. Use Unicode equation notation; no embedded scripts/HTML are evaluated.

Create a draft exam for an assigned class, configure its UTC-backed availability/duration/attempt count/randomization, and add questions from your bank. Each addition snapshots the question. Review, optionally schedule, then publish. Scheduling reserves the window; publishing is the deliberate step that exposes it. Students can start only inside the configured window.

Attempts save answers to the server with a deadline controlled by the server. Close the exam to finalize active attempts. Multiple-choice and true/false answers are automatically graded; other nonblank answers need manual grades. Release results only when every attempt is graded. Released results include permitted answers and feedback.

## Resources and communication

Resources can be protected files or external HTTP(S) links, with title, description, and topic. Drafts are private to staff with class access. Publish to make them available to enrolled students. File knowledge/URLs alone never grant access.

Publish announcements to an assigned class. Use Inbox for authorized communication with your students or administrators and for pending work. Notifications are informational publication/result events. Archived classes and years remain visible for history but reject new work.
