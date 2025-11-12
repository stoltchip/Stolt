// === ADMIN PANEL – LOGIN ONLY BY PIN ===

// Connect to Supabase
const { createClient } = window.supabase;
const supabase = createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");

const pinInput = document.getElementById("adminPin");
const loginButton = document.getElementById("loginButton");

async function checkPin() {
  const pin = pinInput.value.trim();
  if (!pin) {
    alert("Voer de PIN in.");
    return;
  }

  const { data, error } = await supabase
    .from("settings")
    .select("admin_pin_sha256")
    .eq("id", 1)
    .single();

  if (error) {
    console.error(error);
    alert("Fout bij het laden van de PIN.");
    return;
  }

  const hashedPin = await hashSHA256(pin);
  if (hashedPin === data.admin_pin_sha256) {
    loginSection.style.display = "none";
    appSection.style.display = "block";
    loadProducts();
  } else {
    alert("Onjuiste PIN!");
  }
}

async function hashSHA256(text) {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

loginButton.addEventListener("click", checkPin);

// === REST OF ADMIN FUNCTIONS (same as before) ===
