# Password recovery and study-plan removal

## Problem Statement
How might a student who cannot sign in get back into ARC, and how might staff do that for them, without weakening TOTP or letting an admin learn a student's password — while the study-plan suggestion disappears from the product?

## Recommended Direction
Signed-in students and staff change their own password with the current one. A locked-out person submits their email on a forgot-password page and keeps that browser open. Every admin Overview page lists the request. One admin approves it. That same browser then asks for a new password. The admin never receives the reset token or the new password.

There is no mail sender, and login was built so a password alone cannot skip the authenticator. An email link, or an admin typing the new password, both fight that design. Approval on the dashboard is the notification: the app has no push or email channel.

Study plan goes away for anyone using the app by removing the planner control, `/api/planning/study-plans/`, and the code that exists only to serve that endpoint. `SchedulingState.study_plan` stays in the database so this does not need a migration. Hiding the button and leaving the endpoint up would not be gone.

## Key Assumptions to Validate
- [ ] An admin only approves a request they were expecting. Anyone who knows an email can file a request. Approval is the lock.
- [ ] The student finishes in the browser that filed the request. Closing it means filing again. A carry-around code would also reveal which emails exist.
- [ ] A signed-in password change does not alert admins. Only a locked-out request does.
- [ ] "Notification" means the Overview list refreshing while the page is open, not email or browser push.

## MVP Scope
- `POST /api/auth/password/change/` for a signed-in account, current password required.
- Public reset request, status, and confirm. Unknown emails get the same response as known ones.
- Admin list and approve on `/api/admin/password-resets/`. The list id is not the student's token.
- Forgot-password page, a password form on student Settings and the staff Overview, and an approval queue on Overview.
- Study-plan UI, API, service, model client, and tests removed. The JSON column stays.
- Requirement and architecture docs updated to match.

## Not Doing (and Why)
- Email reset links — no mail sender, and it is a larger trust change than this course demo needs.
- Admin-chosen passwords — staff would then be able to sign in as the student.
- A code the student can carry to another device — it leaks whether an email is registered.
- Dropping `SchedulingState.study_plan` — users already cannot see or call it once the API is gone.
- Push notifications — a shared dashboard queue is the whole staff audience.

## Open Questions
- None for this build. A later version can add mail if the course environment gets a sender.
