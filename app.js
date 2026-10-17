import { auth, googleProvider, db, storage } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ================= STATE GLOBAL =================
let currentUser = null;
let currentUserData = null;
let allUsers = [];
let selectedContact = null;
let currentChatId = null;

let unsubscribeUsers = null;
let unsubscribeMessages = null;
let unsubscribeChatMeta = null;
let typingTimeout = null;

let pendingChatImageFile = null;
let pendingChatImageURL = "";
let pendingAvatarFile = null;

// ================= DOM ELEMENTS =================
const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const authError = document.getElementById("auth-error");

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const btnGoogleLogin = document.getElementById("btn-google-login");

const myAvatar = document.getElementById("my-avatar");
const myDisplayName = document.getElementById("my-display-name");
const contactListEl = document.getElementById("contact-list");
const searchContactsInput = document.getElementById("search-contacts");

const chatArea = document.getElementById("chat-area");
const chatWelcome = document.getElementById("chat-welcome");
const activeChat = document.getElementById("active-chat");
const btnBackMobile = document.getElementById("btn-back-mobile");

const activeContactAvatar = document.getElementById("active-contact-avatar");
const activeContactName = document.getElementById("active-contact-name");
const activeContactVerified = document.getElementById("active-contact-verified");
const activeContactStatus = document.getElementById("active-contact-status");

const messagesContainer = document.getElementById("messages-container");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

const chatImageInput = document.getElementById("chat-image-input");
const btnAttachImage = document.getElementById("btn-attach-image");
const btnAttachUrl = document.getElementById("btn-attach-url");
const imagePreviewBar = document.getElementById("image-preview-bar");
const imagePreviewEl = document.getElementById("image-preview-el");
const imagePreviewName = document.getElementById("image-preview-name");
const btnCancelImage = document.getElementById("btn-cancel-image");

// Modals
const profileModal = document.getElementById("profile-modal");
const contactModal = document.getElementById("contact-modal");
const adminModal = document.getElementById("admin-modal");

// ================= UTILITY FUNCTIONS =================
function showAuthError(msg) {
  authError.innerHTML = `<i class="ri-error-warning-line"></i> <span>${escapeHTML(msg)}</span>`;
  authError.classList.remove("hidden");
}

function clearAuthError() {
  authError.innerHTML = "";
  authError.classList.add("hidden");
}

function getDefaultAvatar(seed) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed || "Stecy")}`;
}

function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "Offline";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `Terakhir dilihat ${date.toLocaleDateString("id-ID")} ${date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
}

// ================= THEME TOGGLE (DARK / LIGHT) =================
const btnThemeToggle = document.getElementById("btn-theme-toggle");
btnThemeToggle.addEventListener("click", () => {
  const html = document.documentElement;
  const current = html.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  btnThemeToggle.innerHTML = next === "dark" ? '<i class="ri-sun-line"></i>' : '<i class="ri-moon-line"></i>';
});

// ================= AUTHENTICATION TABS & LOGIC =================
tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  clearAuthError();
});

tabRegister.addEventListener("click", () => {
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  clearAuthError();
});

// Register Email/Password
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();
  const name = document.getElementById("reg-name").value.trim();
  const rawUsername = document.getElementById("reg-username").value.trim().replace(/^@/, "");
  const username = `@${rawUsername.toLowerCase()}`;
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const userDocRef = doc(db, "users", cred.user.uid);
    await setDoc(userDocRef, {
      uid: cred.user.uid,
      name: name,
      username: username,
      email: email,
      photoURL: getDefaultAvatar(name),
      bio: "Halo! Saya menggunakan StecyHat.",
      isVerified: false,
      isOnline: true,
      lastSeen: serverTimestamp()
    });
  } catch (err) {
    showAuthError("Gagal mendaftar: " + err.message);
  }
});

// Login Email/Password
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showAuthError("Email atau password salah / belum terdaftar.");
  }
});

// Login Google
btnGoogleLogin.addEventListener("click", async () => {
  clearAuthError();
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const user = cred.user;
    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);

    if (!snap.exists()) {
      const defaultUsername = "@" + (user.email ? user.email.split("@")[0] : "user");
      await setDoc(userDocRef, {
        uid: user.uid,
        name: user.displayName || "Stecy User",
        username: defaultUsername,
        email: user.email || "",
        photoURL: user.photoURL || getDefaultAvatar(user.uid),
        bio: "Halo! Saya menggunakan StecyHat.",
        isVerified: false,
        isOnline: true,
        lastSeen: serverTimestamp()
      });
    } else {
      await updateDoc(userDocRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      });
    }
  } catch (err) {
    showAuthError("Gagal login Google: " + err.message);
  }
});

// Logout
document.getElementById("btn-logout").addEventListener("click", async () => {
  if (currentUser) {
    await updateDoc(doc(db, "users", currentUser.uid), {
      isOnline: false,
      lastSeen: serverTimestamp()
    });
  }
  await signOut(auth);
});

// ================= AUTH STATE LISTENER =================
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    authScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");

    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        name: user.displayName || "User StecyHat",
        username: "@" + (user.email ? user.email.split("@")[0] : "stecy"),
        email: user.email || "",
        photoURL: user.photoURL || getDefaultAvatar(user.uid),
        bio: "Halo! Saya menggunakan StecyHat.",
        isVerified: false,
        isOnline: true,
        lastSeen: serverTimestamp()
      });
    } else {
      await updateDoc(userDocRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      });
    }

    listenToUsers();
  } else {
    currentUser = null;
    currentUserData = null;
    selectedContact = null;
    if (unsubscribeUsers) unsubscribeUsers();
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeChatMeta) unsubscribeChatMeta();

    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
});

// Update status online/lastSeen ketika tab ditutup
window.addEventListener("beforeunload", () => {
  if (currentUser) {
    updateDoc(doc(db, "users", currentUser.uid), {
      isOnline: false,
      lastSeen: serverTimestamp()
    });
  }
});

// ================= REAL-TIME USERS & CONTACTS LIST =================
function listenToUsers() {
  const usersRef = collection(db, "users");
  unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
    allUsers = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.uid === currentUser.uid) {
        currentUserData = data;
        updateMyHeaderUI(data);
      } else {
        allUsers.push(data);
      }
    });

    renderContactList(searchContactsInput.value.trim());
    renderAdminUserList();

    if (selectedContact) {
      const updated = allUsers.find((u) => u.uid === selectedContact.uid);
      if (updated) {
        selectedContact = updated;
        updateActiveContactHeaderUI(updated);
      }
    }
  });
}

function updateMyHeaderUI(data) {
  myAvatar.src = data.photoURL || getDefaultAvatar(data.name);
  myDisplayName.innerHTML = `
    <span>${escapeHTML(data.name)}</span>
    ${data.isVerified ? '<span class="verified-badge"><i class="ri-verified-badge-fill"></i></span>' : ""}
  `;
}

function renderContactList(filterText = "") {
  const keyword = filterText.toLowerCase();
  const filtered = allUsers.filter(
    (u) =>
      (u.name && u.name.toLowerCase().includes(keyword)) ||
      (u.username && u.username.toLowerCase().includes(keyword))
  );

  if (filtered.length === 0) {
    contactListEl.innerHTML = `
      <div class="empty-list">
        <i class="ri-user-search-line"></i>
        <span>Belum ada kontak yang cocok.</span>
      </div>
    `;
    return;
  }

  contactListEl.innerHTML = "";
  filtered.forEach((user) => {
    const item = document.createElement("div");
    item.className = `contact-item ${selectedContact && selectedContact.uid === user.uid ? "active" : ""}`;
    item.innerHTML = `
      <div class="avatar-wrapper">
        <img src="${escapeHTML(user.photoURL || getDefaultAvatar(user.name))}" alt="Avatar" class="avatar" />
        ${user.isOnline ? '<span class="online-indicator"></span>' : ""}
      </div>
      <div class="contact-item-body">
        <div class="contact-item-top">
          <div class="contact-item-name">
            <span>${escapeHTML(user.name)}</span>
            ${user.isVerified ? '<span class="verified-badge" title="Verified"><i class="ri-verified-badge-fill"></i></span>' : ""}
          </div>
        </div>
        <div class="contact-item-sub">${escapeHTML(user.bio || user.username || "")}</div>
      </div>
    `;
    item.addEventListener("click", () => selectContact(user));
    contactListEl.appendChild(item);
  });
}

searchContactsInput.addEventListener("input", (e) => {
  renderContactList(e.target.value.trim());
});

// ================= SELECT CONTACT & REAL-TIME 1-ON-1 CHAT =================
function selectContact(user) {
  selectedContact = user;
  currentChatId = getChatId(currentUser.uid, user.uid);

  chatWelcome.classList.add("hidden");
  activeChat.classList.remove("hidden");
  chatArea.classList.add("mobile-open");

  renderContactList(searchContactsInput.value.trim());
  updateActiveContactHeaderUI(user);

  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeChatMeta) unsubscribeChatMeta();

  // Listener dokumen chat utama untuk indikator "sedang mengetik..."
  const chatDocRef = doc(db, "chats", currentChatId);
  unsubscribeChatMeta = onSnapshot(chatDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      const isTargetTyping = data.typing && data.typing[selectedContact.uid];
      if (isTargetTyping) {
        activeContactStatus.innerHTML = `<i class="ri-edit-circle-line"></i> <span>sedang mengetik...</span>`;
        activeContactStatus.classList.add("typing");
      } else {
        activeContactStatus.classList.remove("typing");
        updateActiveContactHeaderUI(selectedContact);
      }
    }
  });

  // Listener sub-koleksi messages
  const messagesRef = collection(db, "chats", currentChatId, "messages");
  const q = query(messagesRef, orderBy("timestamp", "asc"));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    messagesContainer.innerHTML = "";
    snapshot.forEach((msgDoc) => {
      const msg = msgDoc.data();
      const isMe = msg.senderId === currentUser.uid;

      if (!isMe && msg.status !== "read") {
        updateDoc(doc(db, "chats", currentChatId, "messages", msgDoc.id), {
          status: "read"
        });
      }

      renderMessageBubble(msg, isMe);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function updateActiveContactHeaderUI(user) {
  activeContactAvatar.src = user.photoURL || getDefaultAvatar(user.name);
  activeContactName.textContent = user.name;
  if (user.isVerified) {
    activeContactVerified.classList.remove("hidden");
  } else {
    activeContactVerified.classList.add("hidden");
  }

  if (!activeContactStatus.classList.contains("typing")) {
    activeContactStatus.innerHTML = user.isOnline
      ? `<i class="ri-checkbox-blank-circle-fill" style="color:var(--online); font-size:8px;"></i> <span>Online</span>`
      : `<i class="ri-time-line"></i> <span>${escapeHTML(formatLastSeen(user.lastSeen))}</span>`;
  }
}

function renderMessageBubble(msg, isMe) {
  const row = document.createElement("div");
  row.className = `msg-row ${isMe ? "me" : "other"}`;

  const checkIcon = isMe
    ? `<i class="ri-check-double-line read-receipt ${msg.status === "read" ? "read" : ""}"></i>`
    : "";

  const imageHTML = msg.imageURL
    ? `<img src="${escapeHTML(msg.imageURL)}" alt="Lampiran Gambar" class="msg-image" onclick="window.open('${escapeHTML(msg.imageURL)}', '_blank')" />`
    : "";

  const textHTML = msg.text ? `<div>${escapeHTML(msg.text)}</div>` : "";

  row.innerHTML = `
    <div class="msg-bubble">
      ${imageHTML}
      ${textHTML}
      <div class="msg-meta">
        <span>${formatTime(msg.timestamp)}</span>
        ${checkIcon}
      </div>
    </div>
  `;
  messagesContainer.appendChild(row);
}

// Tombol kembali di layar HP
btnBackMobile.addEventListener("click", () => {
  chatArea.classList.remove("mobile-open");
});

// ================= TYPING INDICATOR =================
messageInput.addEventListener("input", async () => {
  if (!currentChatId || !currentUser) return;
  const chatDocRef = doc(db, "chats", currentChatId);

  await setDoc(
    chatDocRef,
    {
      participants: [currentUser.uid, selectedContact.uid],
      typing: { [currentUser.uid]: true }
    },
    { merge: true }
  );

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(async () => {
    await setDoc(
      chatDocRef,
      { typing: { [currentUser.uid]: false } },
      { merge: true }
    );
  }, 2000);
});

// ================= KIRIM PESAN TEKS & GAMBAR =================
btnAttachImage.addEventListener("click", () => chatImageInput.click());

chatImageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingChatImageFile = file;
  pendingChatImageURL = "";
  imagePreviewEl.src = URL.createObjectURL(file);
  imagePreviewName.textContent = file.name;
  imagePreviewBar.classList.remove("hidden");
});

btnAttachUrl.addEventListener("click", () => {
  const url = prompt("Masukkan URL Gambar langsung (https://...):");
  if (url && url.startsWith("http")) {
    pendingChatImageURL = url.trim();
    pendingChatImageFile = null;
    imagePreviewEl.src = pendingChatImageURL;
    imagePreviewName.textContent = "Gambar dari URL";
    imagePreviewBar.classList.remove("hidden");
  }
});

btnCancelImage.addEventListener("click", clearPendingChatImage);

function clearPendingChatImage() {
  pendingChatImageFile = null;
  pendingChatImageURL = "";
  chatImageInput.value = "";
  imagePreviewBar.classList.add("hidden");
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedContact || !currentChatId) return;

  const text = messageInput.value.trim();
  if (!text && !pendingChatImageFile && !pendingChatImageURL) return;

  messageInput.value = "";
  let uploadedImageURL = pendingChatImageURL;

  try {
    if (pendingChatImageFile) {
      const fileRef = ref(
        storage,
        `chat_images/${currentChatId}/${Date.now()}_${pendingChatImageFile.name}`
      );
      const snap = await uploadBytes(fileRef, pendingChatImageFile);
      uploadedImageURL = await getDownloadURL(snap.ref);
    }

    clearPendingChatImage();

    const messagesRef = collection(db, "chats", currentChatId, "messages");
    await addDoc(messagesRef, {
      senderId: currentUser.uid,
      text: text,
      imageURL: uploadedImageURL || "",
      timestamp: serverTimestamp(),
      status: "sent"
    });

    await setDoc(
      doc(db, "chats", currentChatId),
      {
        participants: [currentUser.uid, selectedContact.uid],
        lastMessage: text || "Mengirim gambar",
        lastMessageTime: serverTimestamp(),
        typing: { [currentUser.uid]: false }
      },
      { merge: true }
    );
  } catch (err) {
    alert("Gagal mengirim pesan/gambar: " + err.message);
  }
});

// ================= FITUR PROFIL SAYA (DRAG & DROP / URL) =================
const btnOpenProfile = document.getElementById("btn-open-profile");
const btnCloseProfile = document.getElementById("btn-close-profile");
const profileForm = document.getElementById("profile-form");
const editAvatarPreview = document.getElementById("edit-avatar-preview");
const editAvatarUrl = document.getElementById("edit-avatar-url");
const avatarDropzone = document.getElementById("avatar-dropzone");
const avatarFileInput = document.getElementById("avatar-file-input");

btnOpenProfile.addEventListener("click", () => {
  if (!currentUserData) return;
  pendingAvatarFile = null;
  editAvatarPreview.src = currentUserData.photoURL || getDefaultAvatar(currentUserData.name);
  editAvatarUrl.value = currentUserData.photoURL || "";
  document.getElementById("edit-name").value = currentUserData.name || "";
  document.getElementById("edit-username").value = currentUserData.username || "";
  document.getElementById("edit-bio").value = currentUserData.bio || "";
  profileModal.classList.remove("hidden");
});

btnCloseProfile.addEventListener("click", () => profileModal.classList.add("hidden"));

avatarDropzone.addEventListener("click", () => avatarFileInput.click());

avatarDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  avatarDropzone.classList.add("dragover");
});

avatarDropzone.addEventListener("dragleave", () => {
  avatarDropzone.classList.remove("dragover");
});

avatarDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  avatarDropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    handleAvatarFileSelect(file);
  }
});

avatarFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleAvatarFileSelect(file);
});

function handleAvatarFileSelect(file) {
  pendingAvatarFile = file;
  editAvatarPreview.src = URL.createObjectURL(file);
}

editAvatarUrl.addEventListener("input", (e) => {
  const url = e.target.value.trim();
  if (url.startsWith("http")) {
    pendingAvatarFile = null;
    editAvatarPreview.src = url;
  }
});

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btnSave = document.getElementById("btn-save-profile");
  btnSave.disabled = true;
  btnSave.innerHTML = '<i class="ri-loader-4-line"></i> <span>Menyimpan...</span>';

  try {
    let finalPhotoURL = editAvatarUrl.value.trim() || currentUserData.photoURL;

    if (pendingAvatarFile) {
      const avatarRef = ref(storage, `avatars/${currentUser.uid}_${Date.now()}`);
      const snap = await uploadBytes(avatarRef, pendingAvatarFile);
      finalPhotoURL = await getDownloadURL(snap.ref);
    }

    const rawUsername = document.getElementById("edit-username").value.trim().replace(/^@/, "");
    await updateDoc(doc(db, "users", currentUser.uid), {
      name: document.getElementById("edit-name").value.trim(),
      username: `@${rawUsername.toLowerCase()}`,
      bio: document.getElementById("edit-bio").value.trim(),
      photoURL: finalPhotoURL
    });

    profileModal.classList.add("hidden");
  } catch (err) {
    alert("Gagal memperbarui profil: " + err.message);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<i class="ri-save-line"></i><span>Simpan Perubahan</span>';
  }
});

// ================= LIHAT PROFIL USER LAIN =================
function openContactProfileModal() {
  if (!selectedContact) return;
  document.getElementById("view-contact-avatar").src =
    selectedContact.photoURL || getDefaultAvatar(selectedContact.name);
  document.getElementById("view-contact-name").textContent = selectedContact.name;
  document.getElementById("view-contact-username").textContent = selectedContact.username || "";
  document.getElementById("view-contact-bio").textContent = selectedContact.bio || "-";

  const lastSeenEl = document.getElementById("view-contact-lastseen");
  lastSeenEl.innerHTML = selectedContact.isOnline
    ? `<i class="ri-checkbox-blank-circle-fill" style="color:var(--online); font-size:9px;"></i> <span>Sedang Online</span>`
    : `<i class="ri-time-line"></i> <span>${escapeHTML(formatLastSeen(selectedContact.lastSeen))}</span>`;

  const badge = document.getElementById("view-contact-verified");
  if (selectedContact.isVerified) {
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  contactModal.classList.remove("hidden");
}

document.getElementById("btn-view-contact-profile").addEventListener("click", openContactProfileModal);
document.getElementById("btn-info-contact").addEventListener("click", openContactProfileModal);
document.getElementById("btn-close-contact-modal").addEventListener("click", () => {
  contactModal.classList.add("hidden");
});

// ================= PANEL ADMIN (TOGGLE VERIFIED BADGE) =================
const btnOpenAdmin = document.getElementById("btn-open-admin");
const btnCloseAdmin = document.getElementById("btn-close-admin");
const adminUserList = document.getElementById("admin-user-list");

btnOpenAdmin.addEventListener("click", () => {
  renderAdminUserList();
  adminModal.classList.remove("hidden");
});

btnCloseAdmin.addEventListener("click", () => adminModal.classList.add("hidden"));

function renderAdminUserList() {
  if (!currentUserData) return;
  const everyone = [currentUserData, ...allUsers];
  adminUserList.innerHTML = "";

  everyone.forEach((u) => {
    const row = document.createElement("div");
    row.className = "admin-user-item";
    row.innerHTML = `
      <div class="admin-user-left">
        <img src="${escapeHTML(u.photoURL || getDefaultAvatar(u.name))}" class="avatar" style="width:36px;height:36px;" />
        <div>
          <div class="contact-item-name">
            <span>${escapeHTML(u.name)} ${u.uid === currentUser.uid ? "(Saya)" : ""}</span>
            ${u.isVerified ? '<span class="verified-badge"><i class="ri-verified-badge-fill"></i></span>' : ""}
          </div>
          <div class="text-muted small-text">${escapeHTML(u.username || u.email || "")}</div>
        </div>
      </div>
      <button class="btn-verify-toggle ${u.isVerified ? "verified" : ""}">
        ${
          u.isVerified
            ? '<i class="ri-verified-badge-fill"></i> <span>Verified</span>'
            : '<i class="ri-shield-user-line"></i> <span>Set Verified</span>'
        }
      </button>
    `;

    const btn = row.querySelector(".btn-verify-toggle");
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "users", u.uid), {
        isVerified: !u.isVerified
      });
    });

    adminUserList.appendChild(row);
  });
}

// Helper anti-XSS
function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
