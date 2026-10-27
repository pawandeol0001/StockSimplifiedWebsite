# Stock Simplified — Admin Content Management Demo

A student-project website built with HTML, CSS, JavaScript, Node.js, Express and SQLite.

## Run locally
1. Open this `stock-simplified` folder in VS Code.
2. Open a terminal in this folder.
3. Run `npm.cmd install` (Windows PowerShell) or `npm install` (Command Prompt / macOS / Linux).
4. Run `npm.cmd start` (Windows PowerShell) or `npm start`.
5. Visit http://localhost:3000.

If PowerShell blocks `npm`, use the `npm.cmd` commands shown above. Do not change PowerShell execution policy just for this project.

## Demo administrator
- Email: `admin@stocksimplified.local`
- Password: `Admin@123`

Use the demo admin account only for local classroom demonstration. Change credentials and session secrets before deployment.

## Admin controls
After logging in, select **Admin Dashboard** in the navigation. Admin can:
- Edit the homepage heading and description.
- Edit the About page description and website name.
- Add new podcast episodes.
- Edit existing episode details.
- Delete episodes (related bookmarks/progress/quiz records for that episode are also removed).
- Review registered users, quiz activity and demo package/payment records.

Content and records are stored in the local SQLite database at `data/stock-simplified.db`.

## User features
- Register and log in.
- Browse episodes, save bookmarks, use quizzes and track progress.
- Select the 7-day free trial or a paid demo package.

## Payment note
The checkout is a **simulated classroom demo**, not a live payment gateway. It does not collect real money. For real payments, configure a provider such as Razorpay with merchant credentials and verify payment signatures server-side before granting a package.
