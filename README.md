# Raza Online Services

## Run the app

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

The app works without Firebase. In local mode, data is saved only in the current browser and is not shared with other devices.

## Create a Firebase Realtime Database

1. Open [Firebase Console](https://console.firebase.google.com/) and create a Firebase project.
2. In the project, choose **Add app** and register a **Web app**. Open **Project settings** and find the web app's Firebase configuration values.
3. Open **Build > Realtime Database** and choose **Create Database**. Select a nearby location and choose **Start in locked mode**.
4. Copy the database URL shown on the Realtime Database page. Do not guess it from the project name; the region is part of the URL.
5. Copy `.env.example` to `.env.local` in the project root. Replace each blank value using your Firebase web app configuration. Keep the variable names unchanged.
6. Stop and restart `npm run dev` after changing `.env.local`.

Your `.env.local` should look like this:

```dotenv
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-database-url
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-web-app-id
```

## Deploy on Vercel

In Vercel, open your project and go to **Settings > Environment Variables**. Add every `VITE_FIREBASE_...` variable from `.env.local` for the environments you use, then redeploy. Vite puts these values into the app at build time, so changing them requires a new deployment.

## Important security note

The app currently has its own username/password login; it does not sign users in with Firebase Authentication. Firebase's locked database rules will therefore reject its database requests. Do not fix this by making the database publicly readable and writable: the app stores customer and user data, and public rules would let anyone access or change it. Secure multi-device sync requires adding Firebase Authentication and matching database rules, or using a trusted backend, before storing real customer data.

The app has a startup timeout so a Firebase connection problem does not hide the login screen. Local changes are saved in the current browser as a fallback; they do not sync to other devices unless the database connection is securely configured.
