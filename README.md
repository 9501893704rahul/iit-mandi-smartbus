# IIT Mandi SmartBus Portal

Real-time OAS-style campus shuttle seat booking for:

- North Campus to South Campus
- South Campus to North Campus

## Current features

- Real 30-seat bus grid with Driver Seat and Gate.
- Firestore real-time updates across phones and computers.
- Atomic seat-booking transaction to prevent double booking.
- Server-enforced maximum of two seats per user for each trip.
- Rolling future departure slots at :15, :30 and :45 using Asia/Kolkata time.
- Automatic anonymous Firebase identity.
- First-time Student/PhD registration: Name, Roll No, Email.
- First-time Intern registration: Name, Email, optional Intern ID.
- Private profile: email and Roll No are not included in public passenger rows.
- Owner-only cancellation from the same authenticated browser profile.
- Daily booking separation using the Asia/Kolkata service date.
- Secure Google-authenticated admin panel with schedule controls, extra bus,
  booking cancellation and CSV export.

## Firebase project

Project ID: `iit-mandi-smartbus`

Before making the site public, copy `firestore.rules` into Firebase Console:

1. Firestore > Rules
2. Replace the existing text
3. Publish

## Local preview

Serve the folder over HTTP. ES modules will not reliably run from a direct `file://` URL.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Security note

The student interface hides operational status tables and CSV export. These tools
are available only in `admin.html`, and Firestore rules restrict schedule writes
and administrative cancellation to the approved Google account.
