/*
  ============================================================
  FILE: js/sms.js
  PURPOSE: Sends real SMS messages via Africa's Talking API.

  HOW SMS WORKS IN THIS APP:
  1. We call sendSMS(phone, message) from anywhere in the app
  2. This file formats the request and sends it to AT's API
  3. Africa's Talking delivers the SMS to the real phone

  IMPORTANT FOR HACKATHON DEMO:
  Africa's Talking Sandbox sends real SMS to numbers you add
  to your "sandbox users" list for FREE during testing.
  
  SETUP STEPS (do this once):
  1. Go to africastalking.com → sign up → choose Sandbox
  2. Go to Sandbox → SMS → Sandbox users → add your team's numbers
  3. Get your API key from Settings → API Key
  4. Replace AT_USERNAME and AT_API_KEY below with your values
  5. For production: change AT_BASE_URL to the live URL

  NOTE ON CORS:
  Africa's Talking blocks direct browser calls for security.
  We use allorigins.win as a free CORS proxy for the demo.
  For production you would use a proper backend server.
  ============================================================
*/

// Your Africa's Talking credentials
// Replace these with your real values from the AT dashboard
const AT_USERNAME = 'sandbox';           // Use 'sandbox' for testing
const AT_API_KEY  = 'YOUR_AT_API_KEY';   // Paste your actual API key here
const AT_SENDER   = 'LinkUbuntu';        // Sender name shown on SMS

// API endpoint — sandbox for testing, live for production
const AT_SMS_URL  = 'https://api.sandbox.africastalking.com/version1/messaging';

/*
  sendSMS() sends a real SMS to one or more phone numbers.
  
  Parameters:
    phone   — SA number in format +27821234567 or 0821234567
    message — the text to send (max 160 chars for single SMS)
  
  Returns:
    { success: true }  if sent
    { success: false, error: '...' } if failed
*/
async function sendSMS(phone, message) {
  // Normalise phone number to +27 format
  const normalised = normalisePhone(phone);
  if (!normalised) {
    return { success: false, error: 'Invalid phone number: ' + phone };
  }

  try {
    /*
      Africa's Talking expects form-encoded data, not JSON.
      URLSearchParams builds the correct format.
    */
    const params = new URLSearchParams({
      username: AT_USERNAME,
      to:       normalised,
      message:  message,
      from:     AT_SENDER
    });

    const response = await fetch(AT_SMS_URL, {
      method: 'POST',
      headers: {
        'Accept':       'application/json',
        'apiKey':        AT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();

    // Check if AT accepted the message
    if (data.SMSMessageData && data.SMSMessageData.Recipients) {
      const recipient = data.SMSMessageData.Recipients[0];
      if (recipient.status === 'Success') {
        console.log('SMS sent to', normalised);
        return { success: true };
      }
    }

    return { success: false, error: JSON.stringify(data) };

  } catch (err) {
    console.error('SMS error:', err);
    // Return a fallback so the UI can still show the number to call
    return { success: false, error: err.message, fallback: true };
  }
}

/*
  sendBulkSMS() sends the same message to multiple numbers.
  Used when notifying all of a citizen's emergency contacts.
  
  Parameters:
    contacts — array of { name, phone } objects
    message  — the text to send to all of them
  
  Returns array of results, one per contact.
*/
async function sendBulkSMS(contacts, message) {
  // Send to all contacts at the same time using Promise.all
  // This is faster than sending one by one
  const results = await Promise.all(
    contacts.map(async (contact) => {
      const result = await sendSMS(contact.phone, message);
      return {
        name:    contact.name,
        phone:   contact.phone,
        success: result.success,
        error:   result.error || null
      };
    })
  );
  return results;
}

/*
  generateOTP() creates a random 5-digit PIN for login.
  We use 5 digits because it is:
  - Easy to type quickly
  - Hard enough to guess (100,000 combinations)
  - Standard for South African bank apps
*/
function generateOTP() {
  // Math.random() gives 0 to 0.999...
  // Multiply by 90000 and add 10000 to get 10000–99999
  return String(Math.floor(Math.random() * 90000) + 10000);
}

/*
  sendOTPSMS() generates and sends a login OTP.
  Returns the code so we can save it to the database for verification.
*/
async function sendOTPSMS(phone) {
  const code = generateOTP();
  const message = `LinkUbuntu: Your login code is ${code}. Valid for 5 minutes. Do not share this code with anyone.`;
  const result = await sendSMS(phone, message);
  return { code, sent: result.success, error: result.error };
}

/*
  sendEmergencyAlert() sends a formatted emergency notification.
  Called by the responder app after a fingerprint match.
  
  Parameters:
    contact     — { name, phone }
    citizenName — the name of the accident victim
    location    — GPS or location description
    responder   — { name, role, phone } of the officer
    customMsg   — optional extra message from the responder
*/
async function sendEmergencyAlert(contact, citizenName, location, responder, customMsg) {
  const message = [
    `EMERGENCY ALERT — LinkUbuntu`,
    ``,
    `${contact.name}, this is an urgent notification.`,
    ``,
    `${citizenName} has been involved in an incident.`,
    `Location: ${location}`,
    ``,
    customMsg ? `Message from ${responder.role}: ${customMsg}` : ``,
    ``,
    `Notified by: ${responder.name} (${responder.role})`,
    `Contact: ${responder.phone || 'See app'}`
  ].filter(line => line !== undefined).join('\n');

  return await sendSMS(contact.phone, message);
}

/*
  normalisePhone() converts SA phone numbers to +27 format.
  Africa's Talking requires international format.
  
  Examples:
    0821234567    → +27821234567
    27821234567   → +27821234567
    +27821234567  → +27821234567 (already correct)
*/
function normalisePhone(phone) {
  if (!phone) return null;
  // Remove all spaces, dashes, brackets
  let clean = phone.replace(/[\s\-\(\)]/g, '');
  if (clean.startsWith('+27')) return clean;
  if (clean.startsWith('27'))  return '+' + clean;
  if (clean.startsWith('0'))   return '+27' + clean.substring(1);
  // If none of the above, assume it is already a local number
  if (clean.length === 9)      return '+27' + clean;
  return null; // Unrecognised format
}

// Export so other files can use these functions
export { sendSMS, sendBulkSMS, sendOTPSMS, sendEmergencyAlert, generateOTP, normalisePhone };
