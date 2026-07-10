import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAcsUFWweLu1ReZqCVgSOAhKHaehbL0eeY",
  authDomain: "iit-mandi-smartbus.firebaseapp.com",
  projectId: "iit-mandi-smartbus",
  storageBucket: "iit-mandi-smartbus.firebasestorage.app",
  messagingSenderId: "519723802818",
  appId: "1:519723802818:web:86fa30dd9e8ea64b329b5b",
  measurementId: "G-V3944XC75B"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const serviceDate = indiaDateKey();
const routes = [
  { id: "north-to-south", name: "North Campus -To- South Campus", prefix: "ns" },
  { id: "south-to-north", name: "South Campus -To- North Campus", prefix: "sn" }
];
let baseTrips = buildBaseTrips();

let trips = [];
let bookings = [];
let tripsUnsubscribe = null;
let bookingsUnsubscribe = null;
let authNotice = "";

const authSection = document.getElementById("authSection");
const adminPanel = document.getElementById("adminPanel");
const adminUserBadge = document.getElementById("adminUserBadge");
const signOutBtn = document.getElementById("signOutBtn");
const authMessage = document.getElementById("authMessage");
const adminRouteSelect = document.getElementById("adminRouteSelect");
const adminTripSelect = document.getElementById("adminTripSelect");
const extraRoute = document.getElementById("extraRoute");
const tripsTable = document.getElementById("adminTripsTable");
const bookingsTable = document.getElementById("adminBookingsTable");
const adminTripSummary = document.getElementById("adminTripSummary");
const adminMessage = document.getElementById("adminMessage");

function indiaDateKey() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function buildBaseTrips() {
  const slots = nextDepartureSlots();
  return routes.flatMap(route => slots.map(slot => ({
    id: `${route.prefix}-${slot.key}`,
    routeId: route.id,
    routeName: route.name,
    time: slot.label,
    bus: "BUS(F)",
    capacity: 30,
    running: true,
    isExtra: false,
    serviceDate
  })));
}

function nextDepartureSlots() {
  const now = indiaTimeParts();
  const current = now.hour * 60 + now.minute + now.second / 60;
  const candidates = [];
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of [15, 30, 45]) {
        const absolute = dayOffset * 1440 + hour * 60 + minute;
        if (absolute > current) candidates.push({ hour, minute, absolute });
      }
    }
  }
  return candidates.slice(0, 3).map(value => ({
    key: `${String(value.hour).padStart(2, "0")}${String(value.minute).padStart(2, "0")}`,
    label: formatTime(`${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`)
  }));
}

function indiaTimeParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { hour: Number(value.hour), minute: Number(value.minute), second: Number(value.second) };
}

function tripRef(tripId) {
  return doc(db, "services", serviceDate, "trips", tripId);
}

function bookingsCollection(tripId) {
  return collection(db, "services", serviceDate, "trips", tripId, "bookings");
}

function reservationRef(tripId, uid) {
  return doc(db, "services", serviceDate, "trips", tripId, "reservations", uid);
}

function routeName(routeId) {
  return routes.find(route => route.id === routeId)?.name || routeId;
}

async function verifyAdmin(user) {
  try {
    await getDoc(doc(db, "admin", "access"));
    authNotice = "";
    authSection.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    adminUserBadge.classList.remove("hidden");
    adminUserBadge.textContent = `Admin: ${user.email}`;
    signOutBtn.classList.remove("hidden");
    await ensureBaseTrips();
    subscribeTrips();
  } catch (error) {
    console.error(error);
    authNotice = "This Google account is not authorized as SmartBus admin, or the updated Firestore Rules are not published yet.";
    await signOut(auth);
  }
}

function showSignedOut() {
  authSection.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  adminUserBadge.classList.add("hidden");
  signOutBtn.classList.add("hidden");
  authMessage.textContent = authNotice;
  authMessage.style.color = authNotice ? "#a32121" : "";
  if (tripsUnsubscribe) tripsUnsubscribe();
  if (bookingsUnsubscribe) bookingsUnsubscribe();
}

async function ensureBaseTrips() {
  const missing = [];
  for (const trip of baseTrips) {
    const snapshot = await getDoc(tripRef(trip.id));
    if (!snapshot.exists()) missing.push(trip);
  }
  if (!missing.length) return;
  const batch = writeBatch(db);
  missing.forEach(trip => {
    const { id, ...tripData } = trip;
    batch.set(tripRef(id), { ...tripData, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

function subscribeTrips() {
  if (tripsUnsubscribe) tripsUnsubscribe();
  tripsUnsubscribe = onSnapshot(collection(db, "services", serviceDate, "trips"), snapshot => {
    const activeBaseIds = new Set(baseTrips.map(trip => trip.id));
    trips = snapshot.docs.map(item => ({ id: item.id, _ref: item.ref, ...item.data() }))
      .filter(trip => activeBaseIds.has(trip.id) || (trip.isExtra && isFutureTrip(trip.time)))
      .sort((a, b) => a.routeId.localeCompare(b.routeId) || timeMinutes(a.time) - timeMinutes(b.time));
    renderTripControls();
    renderTripsTable();
    subscribeBookings();
  }, error => {
    console.error(error);
    showAdminMessage("Schedule could not be loaded. Check Firestore Rules.", "error");
  });
}

function isFutureTrip(time) {
  const target = timeMinutes(time);
  const now = indiaTimeParts();
  return target > now.hour * 60 + now.minute;
}

function renderTripControls() {
  const previousRoute = adminRouteSelect.value;
  const previousTrip = adminTripSelect.value;
  const routeOptions = routes.map(route => `<option value="${route.id}">${escapeHTML(route.name)}</option>`).join("");
  adminRouteSelect.innerHTML = routeOptions;
  extraRoute.innerHTML = routeOptions;
  if (routes.some(route => route.id === previousRoute)) adminRouteSelect.value = previousRoute;

  const filtered = trips.filter(trip => trip.routeId === adminRouteSelect.value);
  adminTripSelect.innerHTML = filtered.map(trip => `<option value="${trip.id}">${escapeHTML(trip.time)} — ${escapeHTML(trip.bus)}</option>`).join("");
  if (filtered.some(trip => trip.id === previousTrip)) adminTripSelect.value = previousTrip;
  renderSelectedTrip();
}

function renderSelectedTrip() {
  const trip = selectedTrip();
  if (!trip) {
    adminTripSummary.textContent = "No bus configured for this route.";
    return;
  }
  adminTripSummary.innerHTML = `${escapeHTML(routeName(trip.routeId))}<br>${escapeHTML(trip.time)} | ${escapeHTML(trip.bus)} | Capacity: ${trip.capacity} | <span class="badge ${trip.running ? "green" : "red"}">${trip.running ? "Running" : "Not Running"}</span>`;
  document.getElementById("adminBookingsTitle").textContent = `Passenger Bookings — ${trip.time} ${trip.bus}`;
}

function renderTripsTable() {
  tripsTable.innerHTML = trips.map(trip => `
    <tr>
      <td>${escapeHTML(routeName(trip.routeId))}</td>
      <td>${escapeHTML(trip.time)}</td>
      <td>${escapeHTML(trip.bus)}</td>
      <td>${trip.capacity}</td>
      <td><span class="badge ${trip.running ? "green" : "red"}">${trip.running ? "Running" : "Not Running"}</span></td>
      <td><div class="action-group"><button class="btn light small" data-action="toggle" data-trip="${trip.id}">Toggle</button>${trip.isExtra ? `<button class="btn light small" data-action="remove" data-trip="${trip.id}">Remove Extra</button>` : ""}</div></td>
    </tr>
  `).join("") || `<tr><td colspan="6">No buses configured.</td></tr>`;
}

function subscribeBookings() {
  if (bookingsUnsubscribe) bookingsUnsubscribe();
  const trip = selectedTrip();
  if (!trip) {
    bookings = [];
    renderBookings();
    return;
  }
  bookingsUnsubscribe = onSnapshot(bookingsCollection(trip.id), snapshot => {
    bookings = snapshot.docs.map(item => ({ id: item.id, _ref: item.ref, ...item.data() }))
      .sort((a, b) => Number(a.seatNo) - Number(b.seatNo));
    renderBookings();
  }, error => {
    console.error(error);
    showAdminMessage("Passenger bookings could not be loaded.", "error");
  });
}

function renderBookings() {
  document.getElementById("bookingCount").textContent = `${bookings.length} booked`;
  bookingsTable.innerHTML = bookings.map(item => `
    <tr><td>${escapeHTML(item.seatNo)}</td><td>${escapeHTML(item.passengerName)}</td><td>${escapeHTML(item.bookedBy)}</td><td>${escapeHTML(item.role)}</td><td><button class="btn light small" data-cancel-booking="${item.id}">Cancel</button></td></tr>
  `).join("") || `<tr><td colspan="5">No passengers booked for this bus.</td></tr>`;
}

function selectedTrip() {
  return trips.find(trip => trip.id === adminTripSelect.value) || trips.find(trip => trip.routeId === adminRouteSelect.value) || null;
}

async function applySchedule(mode) {
  try {
    const batch = writeBatch(db);
    baseTrips.forEach(base => {
      const running = mode === "regular" ? true : !base.time.includes(":30 ");
      batch.update(tripRef(base.id), { running, updatedAt: serverTimestamp() });
    });
    await batch.commit();
    showAdminMessage(`${mode === "regular" ? "Regular" : "Vacation"} schedule applied to both routes.`, "success");
  } catch (error) {
    console.error(error);
    showAdminMessage("Schedule update failed.", "error");
  }
}

async function toggleTrip(tripId = selectedTrip()?.id) {
  const trip = trips.find(item => item.id === tripId);
  if (!trip) return;
  try {
    await updateDoc(tripRef(trip.id), { running: !trip.running, updatedAt: serverTimestamp() });
    showAdminMessage(`${trip.time} marked ${trip.running ? "Not Running" : "Running"}.`, "success");
  } catch (error) {
    console.error(error);
    showAdminMessage("Running status could not be changed.", "error");
  }
}

async function addExtraBus() {
  const routeId = extraRoute.value;
  const timeValue = document.getElementById("extraTime").value;
  const bus = document.getElementById("extraBusName").value.trim();
  if (!timeValue || !bus) return showAdminMessage("Enter departure time and bus name.", "warning");
  const route = routes.find(item => item.id === routeId);
  const tripId = `extra-${route.prefix}-${Date.now()}`;
  try {
    await setDoc(tripRef(tripId), {
      routeId,
      routeName: route.name,
      time: formatTime(timeValue),
      bus: bus.slice(0, 40),
      capacity: 30,
      running: true,
      isExtra: true,
      serviceDate,
      updatedAt: serverTimestamp()
    });
    showAdminMessage("Extra bus added and shown live on the student portal.", "success");
  } catch (error) {
    console.error(error);
    showAdminMessage("Extra bus could not be added.", "error");
  }
}

async function removeExtraBus(tripId) {
  const trip = trips.find(item => item.id === tripId && item.isExtra);
  if (!trip) return;
  try {
    const passengerSnapshot = await getDocs(bookingsCollection(tripId));
    if (!passengerSnapshot.empty) return showAdminMessage("Cancel all bookings before removing this extra bus.", "warning");
    await deleteDoc(tripRef(tripId));
    showAdminMessage("Extra bus removed.", "success");
  } catch (error) {
    console.error(error);
    showAdminMessage("Extra bus could not be removed.", "error");
  }
}

async function cancelBooking(bookingId) {
  const booking = bookings.find(item => item.id === bookingId);
  const trip = selectedTrip();
  if (!booking) return;
  try {
    const ownerReservationRef = reservationRef(trip.id, booking.ownerUid);
    await runTransaction(db, async transaction => {
      const reservationSnapshot = await transaction.get(ownerReservationRef);
      transaction.delete(booking._ref);
      if (!reservationSnapshot.exists()) return;
      const remaining = (reservationSnapshot.data().seats || []).filter(seat => seat !== String(booking.seatNo));
      if (remaining.length) {
        transaction.set(ownerReservationRef, { ownerUid: booking.ownerUid, seats: remaining, updatedAt: serverTimestamp() });
      } else {
        transaction.delete(ownerReservationRef);
      }
    });
    showAdminMessage(`Seat ${booking.seatNo} booking cancelled.`, "success");
  } catch (error) {
    console.error(error);
    showAdminMessage("Booking could not be cancelled.", "error");
  }
}

function exportBookings() {
  const trip = selectedTrip();
  if (!trip) return;
  const rows = [["Date", "Route", "Time", "Bus", "Seat", "Passenger", "Booked By", "Role"]];
  bookings.forEach(item => rows.push([serviceDate, routeName(trip.routeId), trip.time, trip.bus, item.seatNo, item.passengerName, item.bookedBy, item.role]));
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smartbus_admin_${serviceDate}_${trip.id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatTime(value) {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${String(hour % 12 || 12).padStart(2, "0")}:${minute} ${suffix}`;
}

function timeMinutes(value) {
  const match = String(value).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 9999;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function showAdminMessage(text, type) {
  adminMessage.textContent = text;
  adminMessage.className = `admin-toast ${type}`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("serviceDateText").textContent = new Date(`${serviceDate}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
document.getElementById("loginBtn").addEventListener("click", async () => {
  authNotice = "";
  authMessage.textContent = "Opening Google sign-in…";
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    authMessage.textContent = error.code === "auth/unauthorized-domain"
      ? "This GitHub Pages domain must be added to Firebase Authentication → Settings → Authorized domains."
      : "Google sign-in failed. Please choose the approved account and try again.";
    authMessage.style.color = "#a32121";
  }
});
signOutBtn.addEventListener("click", () => signOut(auth));
adminRouteSelect.addEventListener("change", () => { renderTripControls(); subscribeBookings(); });
adminTripSelect.addEventListener("change", () => { renderSelectedTrip(); subscribeBookings(); });
document.getElementById("vacationBtn").addEventListener("click", () => applySchedule("vacation"));
document.getElementById("regularBtn").addEventListener("click", () => applySchedule("regular"));
document.getElementById("toggleRunningBtn").addEventListener("click", () => toggleTrip());
document.getElementById("addExtraBusBtn").addEventListener("click", addExtraBus);
document.getElementById("exportAdminBtn").addEventListener("click", exportBookings);
tripsTable.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "toggle") toggleTrip(button.dataset.trip);
  if (button.dataset.action === "remove") removeExtraBus(button.dataset.trip);
});
bookingsTable.addEventListener("click", event => {
  const button = event.target.closest("button[data-cancel-booking]");
  if (button) cancelBooking(button.dataset.cancelBooking);
});

onAuthStateChanged(auth, user => {
  if (user && !user.isAnonymous) verifyAdmin(user);
  else showSignedOut();
});

let rollingWindowKey = nextDepartureSlots().map(slot => slot.key).join("-");
setInterval(async () => {
  if (indiaDateKey() !== serviceDate) {
    window.location.reload();
    return;
  }
  const nextKey = nextDepartureSlots().map(slot => slot.key).join("-");
  if (nextKey !== rollingWindowKey && !adminPanel.classList.contains("hidden")) {
    rollingWindowKey = nextKey;
    baseTrips = buildBaseTrips();
    await ensureBaseTrips();
    subscribeTrips();
  }
}, 30000);
