// Blood compatibility matrix
const BLOOD_COMPATIBILITY = {
  // Key = Recipient blood group; Values = list of compatible donor groups
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], // Universal Recipient
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'] // Universal Donor
};

const DONOR_CAN_GIVE_TO = {
  'O-': ['Everyone (Universal Donor: A+, A-, B+, B-, AB+, AB-, O+, O-)'],
  'O+': ['O+, A+, B+, AB+'],
  'A-': ['A-, A+, AB-, AB+'],
  'A+': ['A+, AB+'],
  'B-': ['B-, B+, AB-, AB+'],
  'B+': ['B+, AB+'],
  'AB-': ['AB-, AB+'],
  'AB+': ['AB+ only (Universal Recipient)']
};

// Toast Notifications
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const bgClass = type === 'error' ? 'bg-red-600 text-white' : (type === 'info' ? 'bg-blue-600 text-white' : 'bg-emerald-700 text-white');
  const icon = type === 'error' ? '⚠️' : (type === 'info' ? 'ℹ️' : '✅');

  toast.className = `toast-item flex items-center gap-3 p-4 rounded-xl shadow-xl font-medium text-sm border border-white/10 ${bgClass}`;
  toast.innerHTML = `
    <span class="text-xl">${icon}</span>
    <span class="flex-1">${message}</span>
    <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white text-lg leading-none font-bold">&times;</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

// Copy to clipboard helper
async function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    showToast(successMsg, 'success');
  } catch (err) {
    console.error('Failed to copy', err);
    showToast('Failed to copy to clipboard', 'error');
  }
}

// Share Native API
async function shareLink(title, text, url) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
    } catch (err) {
      if (err.name !== 'AbortError') {
        copyToClipboard(url, 'Link copied! Share it with friends and donors.');
      }
    }
  } else {
    copyToClipboard(url, 'Registration link copied! Share it with potential donors.');
  }
}

// WhatsApp Message Pre-filler
function openWhatsApp(phone, donorName, bloodGroup) {
  // Strip non-digit characters except leading plus
  let cleanNumber = phone.replace(/[^0-9+]/g, '');
  if (cleanNumber.startsWith('+')) {
    cleanNumber = cleanNumber.substring(1);
  }
  
  const currentUrl = window.location.origin;
  const msg = `Hello ${donorName},\nI found your contact on the Blood Donor Directory (${currentUrl}). We are looking for blood donors with blood group ${bloodGroup}.\nCould you please let us know if you or someone you know are available to donate? Thank you so much!`;
  const encodedMsg = encodeURIComponent(msg);
  const waUrl = `https://wa.me/${cleanNumber}?text=${encodedMsg}`;
  window.open(waUrl, '_blank');
}

// Offline Lightweight QR Code generator using standard canvas
// Generates a scannable visual code or QR SVG placeholder
function renderQRCode(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  // Use public QR service or pure canvas fallback
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&margin=10`;
  img.onload = () => {
    const ctx = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 200;
    ctx.drawImage(img, 0, 0);
  };
  img.onerror = () => {
    // If offline, draw a branded clean QR code placeholder
    const ctx = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 200;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 200, 200);
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 180, 180);
    ctx.fillStyle = '#be123c';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Blood Donor', 100, 95);
    ctx.fillText('Registration', 100, 115);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(text.length > 25 ? text.substring(0, 22) + '...' : text, 100, 140);
  };
}

// Format date nicely
function formatDate(dateStr) {
  if (!dateStr) return 'Never / First Time';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
