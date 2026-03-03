Mercy Church Prayer Sign-up
This is a React-based prayer sign-up application with a real-time Firebase backend and an integrated Admin Dashboard.
Migration to GitHub
To move this code to your GitHub account (rkirkhart-blip):
Create a Repository: Log in to GitHub and create a new repository named mercy-church-prayer.
Local Setup:
Create a folder on your computer.
Save PrayerSignUp.jsx as App.jsx.
Save the provided package.json in the same folder.
Initialize Git:
git init
git add .
git commit -m "Initial commit"
git remote add origin [https://github.com/rkirkhart-blip/mercy-church-prayer.git](https://github.com/rkirkhart-blip/mercy-church-prayer.git)
git push -u origin main


Development on Antigravity / Google Cloud
Once the code is on GitHub, you can pull it into your Antigravity or Google Cloud development environment:
Clone the Repo: Use the terminal in your dev environment to clone your new GitHub repo.
Install Dependencies:
npm install


Configure Firebase:
Ensure you have your Firebase configuration strings ready. Since this environment provided them via global variables (__firebase_config), you will need to replace those lines with your actual Firebase API keys in a local .env file or directly in the code for production.
Run the App:
npm start


Admin Access
URL: Accessible via the "Admin Panel" link in the footer.
Default Passcode: mercyadmin
