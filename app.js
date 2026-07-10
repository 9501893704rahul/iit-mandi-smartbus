import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc
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

const TOTAL_SEATS = 30;
const MAX_SEATS_PER_BOOKING = 2;
const selectedSeats = new Set();
const bookingsByTrip = new Map();
const loadedTrips = new Set();
const liveUnsubscribers = [];
const bookingUnsubscribers = new Map();
const serviceDate = indiaDateKey();

let firebaseUser = null;
let activeUser = null;
let scheduleLoaded = false;
let scheduleDocuments = [];

function rollingTrips(prefix) {
  return nextDepartureSlots().map(slot => ({
    id: `${prefix}-${slot.key}`,
    time: slot.label,
    bus: "BUS(F)",
    capacity: TOTAL_SEATS,
    running: true,
    isExtra: false
  }));
}

function buildBaseRoutes() {
  return [
    { id: "north-to-south", name: "North Campus -To- South Campus", trips: rollingTrips("ns") },
    { id: "south-to-north", name: "South Campus -To- North Campus", trips: rollingTrips("sn") }
  ];
}

let baseRoutes = buildBaseRoutes();

const data = { routes: cloneBaseRoutes() };
let allTrips = data.routes.flatMap(route => route.trips);
allTrips.forEach(trip => bookingsByTrip.set(trip.id, []));

function cloneBaseRoutes() {
  return baseRoutes.map(route => ({
    ...route,
    trips: route.trips.map(trip => ({ ...trip }))
  }));
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
    label: formatClockTime(value.hour, value.minute)
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

function formatClockTime(hour, minute) {
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

const routeSelect = document.getElementById("routeSelect");
const timingSelect = document.getElementById("timingSelect");
const seatSummary = document.getElementById("seatSummary");
const runningInfo = document.getElementById("runningInfo");
const seatMap = document.getElementById("seatMap");
const connectionBadge = document.getElementById("connectionBadge");
const activeUserBadge = document.getElementById("activeUserBadge");
const registerBox = document.getElementById("registerBox");
const bookingBox = document.getElementById("bookingBox");
const userTypeSelect = document.getElementById("userType");
const regNameInput = document.getElementById("regName");
const rollNoInput = document.getElementById("rollNo");
const internIdInput = document.getElementById("internId");
const regEmailInput = document.getElementById("regEmail");
const rollNoRow = document.getElementById("rollNoRow");
const internIdRow = document.getElementById("internIdRow");
const registerMessage = document.getElementById("registerMessage");
const bookingUserInfo = document.getElementById("bookingUserInfo");
const passengerNamesInput = document.getElementById("passengerNames");
const message = document.getElementById("message");
const statusTable = document.getElementById("statusTable");
const passengerTable = document.getElementById("passengerTable");
const todayText = document.getElementById("todayText");
const openBookingBtn = document.getElementById("openBookingBtn");
const bookBtn = document.getElementById("bookBtn");

const seatLayout = [
  [{ type: "seat", no: 1 }, { type: "empty" }, { type: "driver", label: "Driver Seat", span: 3 }],
  [{ type: "seat", no: 2 }, { type: "seat", no: 3 }, { type: "empty" }, { type: "seat", no: 4 }, { type: "seat", no: 5 }],
  [{ type: "gate", label: "Gate", span: 2 }, { type: "empty", span: 3 }],
  [{ type: "seat", no: 6 }, { type: "seat", no: 7 }, { type: "empty" }, { type: "seat", no: 8 }, { type: "seat", no: 9 }],
  [{ type: "seat", no: 10 }, { type: "seat", no: 11 }, { type: "empty" }, { type: "seat", no: 12 }, { type: "seat", no: 13 }],
  [{ type: "seat", no: 14 }, { type: "seat", no: 15 }, { type: "empty" }, { type: "seat", no: 16 }, { type: "seat", no: 17 }],
  [{ type: "seat", no: 18 }, { type: "seat", no: 19 }, { type: "empty" }, { type: "seat", no: 20 }, { type: "seat", no: 21 }],
  [{ type: "seat", no: 22 }, { type: "seat", no: 23 }, { type: "empty" }, { type: "seat", no: 24 }, { type: "seat", no: 25 }],
  [{ type: "seat", no: 30 }, { type: "seat", no: 29 }, { type: "seat", no: 28 }, { type: "seat", no: 27 }, { type: "seat", no: 26 }]
];

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

function getRoute() {
  return data.routes.find(route => route.id === routeSelect.value) || data.routes[0];
}

function getTrip() {
  const route = getRoute();
  return route.trips.find(trip => trip.id === timingSelect.value) || route.trips[0];
}

function activeBookings(trip) {
  return bookingsByTrip.get(trip.id) || [];
}

function reservedCount(trip) {
  return activeBookings(trip).length;
}

function availableCount(trip) {
  return Math.max(0, trip.capacity - reservedCount(trip));
}

function tripStatus(trip) {
  if (!trip.running) return { text: "Not Running", cls: "red" };
  if (availableCount(trip) === 0) return { text: "Full", cls: "red" };
  if (reservedCount(trip) >= trip.capacity * 0.8) return { text: "Almost Full", cls: "yellow" };
  return { text: "Available", cls: "green" };
}

function bookingForSeat(trip, seatNo) {
  return activeBookings(trip).find(item => Number(item.seatNo) === Number(seatNo));
}

function renderRouteOptions() {
  routeSelect.innerHTML = data.routes
    .map(route => `<option value="${route.id}">${escapeHTML(route.name)}</option>`)
    .join("");
}

function renderTimingOptions() {
  const route = getRoute();
  const selectedValue = timingSelect.value;
  timingSelect.innerHTML = route.trips
    .map(trip => `<option value="${trip.id}">${escapeHTML(trip.time)}</option>`)
    .join("");

  if (route.trips.some(trip => trip.id === selectedValue)) {
    timingSelect.value = selectedValue;
  }
}

function renderSelectedTrip() {
  const route = getRoute();
  const trip = getTrip();
  seatSummary.textContent = `Total Seat: ${trip.capacity} Reserved Seat: ${reservedCount(trip)} Available Seat: ${availableCount(trip)}`;
  runningInfo.className = `running-info ${trip.running ? "running" : "not-running"}`;
  runningInfo.textContent = trip.running
    ? `${route.name} | ${trip.time} | ${trip.bus} is running. Select an available seat and confirm before coming to the bus stop.`
    : `${route.name} | ${trip.time} | ${trip.bus} is not running today. Please select another timing.`;
}

function renderSeatMap() {
  const trip = getTrip();
  seatMap.innerHTML = seatLayout.map(row => row.map(cell => renderCell(cell, trip)).join("")).join("");
}

function renderCell(cell, trip) {
  const span = cell.span ? ` style="grid-column: span ${cell.span}"` : "";
  if (cell.type === "driver") return `<div class="cell driver"${span}>${escapeHTML(cell.label)}</div>`;
  if (cell.type === "gate") return `<div class="cell gate"${span}>${escapeHTML(cell.label)}</div>`;
  if (cell.type === "empty") return `<div class="cell aisle"${span}></div>`;

  const seatNo = Number(cell.no);
  const booking = bookingForSeat(trip, seatNo);
  const isSelected = selectedSeats.has(seatNo);
  let cls = "available";
  let checked = "";
  let title = "Available";

  if (!trip.running) {
    cls = "blocked";
    title = "Not available for reservation";
  } else if (booking) {
    cls = "reserved";
    checked = "checked";
    title = `Reserved by ${booking.bookedBy}`;
  } else if (isSelected) {
    cls = "selected";
    checked = "checked";
    title = "Selected now";
  }

  const disabled = cls === "reserved" || cls === "blocked" ? "aria-disabled=\"true\"" : "";
  return `<div class="cell"><button class="seat ${cls}" data-seat="${seatNo}" title="${escapeHTML(title)}" ${disabled}><input type="checkbox" ${checked} tabindex="-1" onclick="return false;"><span>${seatNo}</span></button></div>`;
}

function renderStatusTable() {
  statusTable.innerHTML = data.routes.flatMap(route => route.trips.map(trip => {
    const status = tripStatus(trip);
    return `<tr><td>${escapeHTML(route.name)}</td><td>${escapeHTML(trip.time)}</td><td>${escapeHTML(trip.bus)}</td><td>${trip.capacity}</td><td>${reservedCount(trip)}</td><td>${availableCount(trip)}</td><td><span class="badge ${status.cls}">${status.text}</span></td></tr>`;
  })).join("");
}

function renderPassengerTable() {
  const rows = [...activeBookings(getTrip())]
    .sort((a, b) => Number(a.seatNo) - Number(b.seatNo))
    .map(item => `<tr><td>${item.seatNo}</td><td>${escapeHTML(item.passengerName)}</td><td>${escapeHTML(item.bookedBy)}</td><td>${escapeHTML(item.role)}</td><td><span class="badge green">Reserved</span></td></tr>`);
  passengerTable.innerHTML = rows.join("") || `<tr><td colspan="5">No passenger booked for this bus.</td></tr>`;
}

function renderUserState() {
  const cancelBtn = document.getElementById("cancelMyBookingBtn");
  const changeBtn = document.getElementById("changeUserBtn");
  if (activeUser) {
    activeUserBadge.classList.remove("hidden");
    activeUserBadge.textContent = `${activeUser.type}: ${activeUser.name}`;
    cancelBtn.classList.remove("hidden");
    changeBtn.classList.remove("hidden");
  } else {
    activeUserBadge.classList.add("hidden");
    cancelBtn.classList.add("hidden");
    changeBtn.classList.add("hidden");
  }
}

function renderAll() {
  todayText.textContent = new Date(`${serviceDate}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
  renderTimingOptions();
  renderSelectedTrip();
  renderSeatMap();
  renderStatusTable();
  renderPassengerTable();
  renderUserState();
}

function nextSeatNumber(trip) {
  for (let seat = 1; seat <= trip.capacity; seat += 1) {
    if (!bookingForSeat(trip, seat)) return seat;
  }
  return null;
}

function autoSelectNextSeat() {
  clearMessages();
  const trip = getTrip();
  if (!trip.running) return showStatusMessage("Selected bus is not running today. Please choose another timing.", "red");
  const seatNo = nextSeatNumber(trip);
  if (!seatNo) return showStatusMessage("Bus is full. Do not come to the bus stop. Please choose another timing.", "yellow");
  selectedSeats.clear();
  selectedSeats.add(seatNo);
  showStatusMessage(`Seat ${seatNo} selected. Complete booking to confirm.`, "green");
  renderSeatMap();
}

function clearSelection() {
  selectedSeats.clear();
  bookingBox.classList.add("hidden");
  renderSeatMap();
  renderSelectedTrip();
}

function handleSeatClick(event) {
  const button = event.target.closest(".seat");
  if (!button) return;
  const seatNo = Number(button.dataset.seat);
  const trip = getTrip();
  if (!trip.running) return showStatusMessage("This bus is not running today. Please choose another timing.", "red");
  if (bookingForSeat(trip, seatNo)) return showStatusMessage(`Seat ${seatNo} is already reserved.`, "yellow");

  if (selectedSeats.has(seatNo)) {
    selectedSeats.delete(seatNo);
  } else if (selectedSeats.size >= MAX_SEATS_PER_BOOKING) {
    return showStatusMessage(`A maximum of ${MAX_SEATS_PER_BOOKING} seats can be booked at once.`, "yellow");
  } else {
    selectedSeats.add(seatNo);
  }

  renderSeatMap();
  if (selectedSeats.size) {
    showStatusMessage(`${[...selectedSeats].sort((a, b) => a - b).join(", ")} selected. Click Book Selected Seat to confirm.`, "green");
  } else {
    renderSelectedTrip();
  }
}

function openBookingFlow() {
  clearMessages();
  if (!firebaseUser) return showStatusMessage("Connecting securely. Please wait a moment and try again.", "yellow");
  if (!getTrip().running) return showStatusMessage("Selected bus is not running today. Choose another timing.", "red");
  if (!selectedSeats.size) autoSelectNextSeat();
  if (!selectedSeats.size) return;
  if (!activeUser) return showRegisterBox();
  showBookingBox();
}

function showRegisterBox() {
  registerBox.classList.remove("hidden");
  bookingBox.classList.add("hidden");
  registerMessage.textContent = "";
  if (activeUser) {
    userTypeSelect.value = activeUser.type;
    regNameInput.value = activeUser.name;
    rollNoInput.value = activeUser.rollNo || "";
    internIdInput.value = activeUser.internId || "";
    regEmailInput.value = activeUser.email;
    updateRegistrationFields();
  }
  registerBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showBookingBox() {
  const trip = getTrip();
  const seats = [...selectedSeats].sort((a, b) => a - b);
  registerBox.classList.add("hidden");
  bookingBox.classList.remove("hidden");
  message.textContent = "";
  bookingUserInfo.innerHTML = `Booking By: ${escapeHTML(activeUser.name)}<br>Role: ${escapeHTML(activeUser.type)}${activeUser.rollNo ? ` &nbsp; Roll No: ${escapeHTML(activeUser.rollNo)}` : ""}${activeUser.internId ? ` &nbsp; Intern ID: ${escapeHTML(activeUser.internId)}` : ""}<br>Selected Bus: ${escapeHTML(getRoute().name)} | ${escapeHTML(trip.time)} | ${escapeHTML(trip.bus)}<br>Selected Seat(s): ${seats.join(", ")}`;
  const currentNames = passengerNamesInput.value.split("\n").map(value => value.trim()).filter(Boolean);
  if (currentNames.length !== seats.length) {
    passengerNamesInput.value = seats.map((_, index) => index === 0 ? activeUser.name : "").join("\n");
  }
  bookingBox.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateRegistrationFields() {
  const isIntern = userTypeSelect.value === "Intern";
  rollNoRow.classList.toggle("hidden", isIntern);
  internIdRow.classList.toggle("hidden", !isIntern);
  regEmailInput.placeholder = isIntern ? "intern@example.com" : "name@students.iitmandi.ac.in";
}

async function saveRegistration() {
  const type = userTypeSelect.value;
  const name = regNameInput.value.trim();
  const rollNo = rollNoInput.value.trim();
  const internId = internIdInput.value.trim();
  const email = regEmailInput.value.trim().toLowerCase();
  if (!name) return showRegisterMessage("Please enter your name.", "red");
  if (type !== "Intern" && !rollNo) return showRegisterMessage("Please enter Roll No for Student/PhD Scholar registration.", "red");
  if (!email || !email.includes("@")) return showRegisterMessage("Please enter a valid email.", "red");
  if (!firebaseUser) return showRegisterMessage("Secure connection is not ready. Please wait and try again.", "red");

  const profile = {
    uid: firebaseUser.uid,
    type,
    name: name.slice(0, 80),
    rollNo: type === "Intern" ? "" : rollNo.slice(0, 40),
    internId: type === "Intern" ? internId.slice(0, 40) : "",
    email: email.slice(0, 120),
    updatedAt: serverTimestamp()
  };

  try {
    document.getElementById("saveRegistrationBtn").disabled = true;
    await setDoc(doc(db, "profiles", firebaseUser.uid), profile, { merge: true });
    activeUser = { ...profile, updatedAt: null };
    renderUserState();
    showRegisterMessage("Registration saved securely. Continue booking below.", "green");
    showBookingBox();
  } catch (error) {
    console.error(error);
    showRegisterMessage("Registration could not be saved. Please check the connection and try again.", "red");
  } finally {
    document.getElementById("saveRegistrationBtn").disabled = false;
  }
}

async function bookSeats() {
  if (!activeUser || !firebaseUser) return showMessage("Please register first before booking.", "red");
  const trip = getTrip();
  const route = getRoute();
  const seats = [...selectedSeats].sort((a, b) => a - b);
  const names = passengerNamesInput.value.split("\n").map(name => name.trim()).filter(Boolean);
  if (!seats.length) return showMessage("Please select at least one available seat.", "red");
  if (names.length !== seats.length) return showMessage(`Please enter exactly ${seats.length} passenger name(s), one per selected seat.`, "red");
  if (names.some(name => name.length > 80)) return showMessage("Passenger names must be 80 characters or fewer.", "red");

  const refs = seats.map(seatNo => bookingDocRef(trip, seatNo));
  const reservationRef = reservationDocRef(trip, firebaseUser.uid);
  try {
    bookBtn.disabled = true;
    bookBtn.textContent = "Confirming…";
    await runTransaction(db, async transaction => {
      const reservationSnapshot = await transaction.get(reservationRef);
      const existingSeats = reservationSnapshot.exists() ? reservationSnapshot.data().seats || [] : [];
      const requestedSeats = seats.map(String);
      const combinedSeats = [...new Set([...existingSeats, ...requestedSeats])];
      if (combinedSeats.length > MAX_SEATS_PER_BOOKING) throw new Error("TRIP_LIMIT");

      const snapshots = [];
      for (const ref of refs) snapshots.push(await transaction.get(ref));
      const taken = snapshots.map((snapshot, index) => snapshot.exists() ? seats[index] : null).filter(Boolean);
      if (taken.length) throw new Error(`SEAT_TAKEN:${taken.join(",")}`);

      transaction.set(reservationRef, {
        ownerUid: firebaseUser.uid,
        seats: combinedSeats,
        updatedAt: serverTimestamp()
      });

      refs.forEach((ref, index) => transaction.set(ref, {
        ownerUid: firebaseUser.uid,
        serviceDate,
        tripId: trip.id,
        routeId: route.id,
        routeName: route.name,
        time: trip.time,
        bus: trip.bus,
        seatNo: String(seats[index]),
        passengerName: names[index],
        bookedBy: activeUser.name,
        role: activeUser.type,
        createdAt: serverTimestamp()
      }));
    });

    const confirmed = seats.map((seat, index) => `${names[index]}: Seat ${seat}`).join(", ");
    selectedSeats.clear();
    passengerNamesInput.value = activeUser.name;
    showMessage(`Confirmed — ${confirmed}. Now you may come to the bus stop.`, "green");
    renderSeatMap();
  } catch (error) {
    console.error(error);
    if (error.message.startsWith("SEAT_TAKEN:")) {
      const seatsTaken = error.message.split(":")[1];
      showMessage(`Seat ${seatsTaken} was just booked by someone else. Please select another seat.`, "red");
    } else if (error.message === "TRIP_LIMIT") {
      showMessage("You can hold a maximum of 2 seats for this timing. Cancel an existing seat before booking another.", "red");
    } else {
      showMessage("Booking could not be confirmed. Check your internet connection and try again.", "red");
    }
  } finally {
    bookBtn.disabled = false;
    bookBtn.textContent = "Confirm Seat Booking";
  }
}

async function cancelLatestBooking() {
  if (!firebaseUser) return showStatusMessage("Secure connection is not ready yet.", "yellow");
  const ownBookings = activeBookings(getTrip())
    .filter(item => item.ownerUid === firebaseUser.uid)
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
  const latest = ownBookings[0];
  if (!latest) return showStatusMessage("No active booking from this device was found for the selected bus.", "red");
  try {
    const reservationRef = reservationDocRef(getTrip(), firebaseUser.uid);
    await runTransaction(db, async transaction => {
      const reservationSnapshot = await transaction.get(reservationRef);
      transaction.delete(latest._ref);
      if (!reservationSnapshot.exists()) return;
      const remaining = (reservationSnapshot.data().seats || []).filter(seat => seat !== String(latest.seatNo));
      if (remaining.length) {
        transaction.set(reservationRef, { ownerUid: firebaseUser.uid, seats: remaining, updatedAt: serverTimestamp() });
      } else {
        transaction.delete(reservationRef);
      }
    });
    showStatusMessage(`Cancelled Seat ${latest.seatNo} for ${latest.passengerName}.`, "green");
  } catch (error) {
    console.error(error);
    showStatusMessage("Cancellation failed. Please check the connection and try again.", "red");
  }
}

function exportCSV() {
  const route = getRoute();
  const trip = getTrip();
  const rows = [["Date", "Route", "Timing", "Bus", "Seat No", "Passenger Name", "Booked By", "Role", "Status"]];
  activeBookings(trip).forEach(item => rows.push([serviceDate, route.name, trip.time, trip.bus, item.seatNo, item.passengerName, item.bookedBy, item.role, "Reserved"]));
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smartbus_${serviceDate}_${trip.id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bookingDocRef(trip, seatNo) {
  return doc(db, "services", serviceDate, "trips", trip.id, "bookings", String(seatNo));
}

function reservationDocRef(trip, uid) {
  return doc(db, "services", serviceDate, "trips", trip.id, "reservations", uid);
}

function tripBookingsCollection(trip) {
  return collection(db, "services", serviceDate, "trips", trip.id, "bookings");
}

function startRealtimeListeners() {
  setConnectionState("connecting", "Syncing seats…");
  allTrips.forEach(ensureBookingListener);

  const unsubscribe = onSnapshot(
    collection(db, "services", serviceDate, "trips"),
    applyScheduleSnapshot,
    handleRealtimeError
  );
  liveUnsubscribers.push(unsubscribe);
}

function ensureBookingListener(trip) {
  if (bookingUnsubscribers.has(trip.id)) return;
  const unsubscribe = onSnapshot(tripBookingsCollection(trip), snapshot => {
    const bookings = snapshot.docs.map(item => ({ id: item.id, _ref: item.ref, ...item.data() }));
    bookingsByTrip.set(trip.id, bookings);
    loadedTrips.add(trip.id);
    const reservedNow = new Set(bookings.map(item => Number(item.seatNo)));
    [...selectedSeats].forEach(seatNo => {
      if (trip.id === getTrip().id && reservedNow.has(seatNo)) selectedSeats.delete(seatNo);
    });
    updateLiveState();
    renderAll();
  }, handleRealtimeError);
  bookingUnsubscribers.set(trip.id, unsubscribe);
  liveUnsubscribers.push(unsubscribe);
}

function applyScheduleSnapshot(snapshot) {
  scheduleDocuments = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  rebuildRoutesFromSchedule();
}

function rebuildRoutesFromSchedule() {
  const previousRouteId = routeSelect.value;
  const previousTripId = timingSelect.value;
  baseRoutes = buildBaseRoutes();
  const nextRoutes = cloneBaseRoutes();

  scheduleDocuments.forEach(config => {
    const route = nextRoutes.find(candidate => candidate.id === config.routeId);
    if (!route) return;
    const existing = route.trips.find(trip => trip.id === config.id);
    const values = {
      id: config.id,
      time: String(config.time || "Extra Time").slice(0, 20),
      bus: String(config.bus || "BUS(F)").slice(0, 40),
      capacity: Math.min(TOTAL_SEATS, Math.max(1, Number(config.capacity) || TOTAL_SEATS)),
      running: Boolean(config.running),
      isExtra: Boolean(config.isExtra)
    };
    if (existing) Object.assign(existing, values);
    else if (values.isExtra && isFutureTrip(values.time)) route.trips.push(values);
  });

  data.routes = nextRoutes;
  allTrips = data.routes.flatMap(route => route.trips);
  const currentIds = new Set(allTrips.map(trip => trip.id));

  for (const [tripId, unsubscribe] of bookingUnsubscribers.entries()) {
    if (!currentIds.has(tripId)) {
      unsubscribe();
      bookingUnsubscribers.delete(tripId);
      bookingsByTrip.delete(tripId);
      loadedTrips.delete(tripId);
    }
  }

  allTrips.forEach(trip => {
    if (!bookingsByTrip.has(trip.id)) bookingsByTrip.set(trip.id, []);
    ensureBookingListener(trip);
  });

  renderRouteOptions();
  if (data.routes.some(route => route.id === previousRouteId)) routeSelect.value = previousRouteId;
  renderTimingOptions();
  if (getRoute().trips.some(trip => trip.id === previousTripId)) timingSelect.value = previousTripId;
  scheduleLoaded = true;
  updateLiveState();
  renderAll();
}

function isFutureTrip(time) {
  const match = String(time).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return true;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  const target = hour * 60 + Number(match[2]);
  const now = indiaTimeParts();
  return target > now.hour * 60 + now.minute;
}

function updateLiveState() {
  const baseIds = baseRoutes.flatMap(route => route.trips.map(trip => trip.id));
  if (scheduleLoaded && baseIds.every(tripId => loadedTrips.has(tripId))) {
    setConnectionState("live", "Live • Real-time");
    openBookingBtn.disabled = false;
  }
}

function handleRealtimeError(error) {
  console.error(error);
  setConnectionState("offline", "Connection error");
  openBookingBtn.disabled = true;
  showStatusMessage("Seat or schedule data could not be loaded. Check Firestore Rules and internet connection.", "red");
}

async function loadProfile() {
  const snapshot = await getDoc(doc(db, "profiles", firebaseUser.uid));
  if (snapshot.exists()) activeUser = snapshot.data();
  renderUserState();
}

function ensureAnonymousUser() {
  return new Promise((resolve, reject) => {
    let attempted = false;
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        firebaseUser = user;
        unsubscribe();
        resolve(user);
      } else if (!attempted) {
        attempted = true;
        signInAnonymously(auth).catch(error => {
          unsubscribe();
          reject(error);
        });
      }
    }, reject);
  });
}

async function boot() {
  renderRouteOptions();
  updateRegistrationFields();
  renderAll();
  try {
    await ensureAnonymousUser();
    await loadProfile();
    startRealtimeListeners();
  } catch (error) {
    console.error(error);
    setConnectionState("offline", "Connection error");
    showStatusMessage("Firebase connection failed. Please verify Anonymous Authentication and Firestore setup.", "red");
  }
}

function setConnectionState(state, text) {
  connectionBadge.className = `connection-badge ${state}`;
  connectionBadge.textContent = text;
}

function showStatusMessage(text, type) {
  runningInfo.className = `running-info ${type === "red" ? "not-running" : type === "yellow" ? "warning" : "running"}`;
  runningInfo.textContent = text;
}

function showMessage(text, type) {
  message.textContent = text;
  message.style.color = type === "red" ? "#a32121" : type === "yellow" ? "#8a5b00" : "#176b3a";
}

function showRegisterMessage(text, type) {
  registerMessage.textContent = text;
  registerMessage.style.color = type === "red" ? "#a32121" : "#176b3a";
}

function clearMessages() {
  message.textContent = "";
  registerMessage.textContent = "";
}

function timestampMillis(timestamp) {
  return timestamp && typeof timestamp.toMillis === "function" ? timestamp.toMillis() : 0;
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

routeSelect.addEventListener("change", () => {
  selectedSeats.clear();
  renderTimingOptions();
  renderAll();
  bookingBox.classList.add("hidden");
});
timingSelect.addEventListener("change", () => {
  selectedSeats.clear();
  renderAll();
  bookingBox.classList.add("hidden");
});
seatMap.addEventListener("click", handleSeatClick);
userTypeSelect.addEventListener("change", updateRegistrationFields);
openBookingBtn.addEventListener("click", openBookingFlow);
document.getElementById("clearSelectionBtn").addEventListener("click", clearSelection);
document.getElementById("saveRegistrationBtn").addEventListener("click", saveRegistration);
document.getElementById("closeRegisterBtn").addEventListener("click", () => registerBox.classList.add("hidden"));
document.getElementById("closeBookingBtn").addEventListener("click", () => bookingBox.classList.add("hidden"));
document.getElementById("changeUserBtn").addEventListener("click", showRegisterBox);
bookBtn.addEventListener("click", bookSeats);
document.getElementById("cancelMyBookingBtn").addEventListener("click", cancelLatestBooking);
document.getElementById("exportBtn").addEventListener("click", exportCSV);
window.addEventListener("beforeunload", () => liveUnsubscribers.forEach(unsubscribe => unsubscribe()));

let rollingWindowKey = nextDepartureSlots().map(slot => slot.key).join("-");
setInterval(() => {
  if (indiaDateKey() !== serviceDate) {
    window.location.reload();
    return;
  }
  const nextKey = nextDepartureSlots().map(slot => slot.key).join("-");
  if (nextKey !== rollingWindowKey) {
    rollingWindowKey = nextKey;
    selectedSeats.clear();
    bookingBox.classList.add("hidden");
    rebuildRoutesFromSchedule();
  }
}, 30000);

boot();
