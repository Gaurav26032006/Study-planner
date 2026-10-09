# Student Productivity Dashboard

A responsive dashboard that helps college students manage tasks, study sessions, notes and focus time. Built with plain HTML, CSS and JavaScript, no build step and no backend. All data stays in your browser's `localStorage`.

## Features
- **Dashboard**: time-based greeting, date, live stats (total, completed, pending, due today, study time today), completion ring, weekly chart, today's schedule, upcoming deadlines, quick-add task.
- **Tasks**: add, edit, delete, complete; search by title; filter by status, subject, priority and due date (filters combine); sort by due date or priority; overdue highlighting; form validation.
- **Study planner**: create, edit, delete and complete sessions; Upcoming / Overdue / Completed labels.
- **Pomodoro**: 25/5/15 minute modes, start, pause, resume, reset; one timer at a time; session counter and total focus minutes (saved).
- **Notes**: add, edit, delete, search, "last updated" date.
- **Analytics**: tasks completed over time, study time by subject, weekly study minutes, completion percentage. Empty datasets show a friendly message.
- Dark (default) and light theme, toasts, confirmation dialogs, **Clear data** button.

## Tech stack
HTML5, CSS3, Vanilla JavaScript (ES6+), [Chart.js](https://www.chartjs.org/) and [Lucide](https://lucide.dev/) via CDN, `localStorage`.

## Screenshots
Add your own after running the app: take screenshots, save them in `assets/` (for example `assets/dashboard.png`) and reference them here:
```md
![Dashboard](assets/dashboard.png)
```

## Run locally
1. Download or clone the project.
2. Open `index.html` in a modern browser (an internet connection is needed once for the CDN libraries and font).
3. Optional: serve it with `npx serve` or the VS Code "Live Server" extension.

## How to use
Create a task with **+ New task**, plan time in **Planner**, run a focus session in **Pomodoro** (type a subject first), write **Notes**, and check progress in **Analytics**. A study session counts toward study time once you press **Mark done**.

## Folder structure
```
student-productivity-dashboard/
  index.html   page structure
  style.css    themes, layout, responsive rules
  script.js    all app logic (storage, rendering, timer, charts)
  README.md
  assets/      screenshots
```

## Deploy to GitHub Pages
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/student-productivity-dashboard.git
git push -u origin main
```
Then on GitHub: **Settings > Pages > Source: Deploy from a branch > main / (root) > Save**. Your site appears at `https://<your-username>.github.io/student-productivity-dashboard/` after a minute or two.

## Debugging tips
Open DevTools (F12): **Console** shows errors; **Application > Local Storage** shows saved data (keys start with `spd_`). If a chart is blank, check that the CDN scripts loaded (Network tab).

## Future improvements
Drag-and-drop tasks, recurring sessions, export/import of data as JSON, browser notifications and sounds for the timer, calendar view.

## Status
The code was written and syntax-checked, but not yet run through a full manual test in a browser or deployed. Please run through the testing checklist from your project brief and fix anything you find.
