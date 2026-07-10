# IIT Mandi SmartBus Portal

Real-time OAS-style seat booking for the IIT Mandi North Campus ⇄ South Campus shuttle.

## Features

- Real 30-seat bus grid with Driver Seat and Gate
- Live Firestore updates across phones and computers
- Atomic seat transactions that prevent double booking
- Minimal first-time registration
- Owner-only booking cancellation
- Daily service data based on Asia/Kolkata date
- CSV passenger-list export

## Firebase

- Project: `iit-mandi-smartbus`
- Firestore region: `asia-south1`
- Authentication: Anonymous
- Firestore security rules: deployed separately in Firebase Console

The Firebase web configuration in `app.js` identifies the public Firebase project. Access control is enforced by Firebase Authentication and Firestore Security Rules.
