# TaskFlow - role-based to-do app

Three separate logins (pick the tab on the login page):
- **Employee**: sees only tasks assigned to them; can change status. Cannot see hidden notes/ratings.
- **Admin**: adds employees, assigns tasks, edits hidden notes/ratings, deletes tasks.
- **Head**: read-only oversight: all tasks, hidden notes/ratings, workload table, activity log.

## Run
1. Install Node.js 18+ (https://nodejs.org)
2. In this folder run: `node server.js`
3. Open http://localhost:3000

No npm install needed (no dependencies).

## Demo accounts
| Role | Username | Password |
|---|---|---|
| Head | head | head123 |
| Admin | admin | admin123 |
| Employee | emp1 / emp2 | emp123 |

Change these passwords by deleting `data/db.json` after editing the seed users in `server.js`.
Data is stored in `data/db.json`. Hidden fields are removed on the server before sending to employees.
