// The only place the payment ID lives. Anyone changing this file needs the owner's review (see .github/CODEOWNERS).
// Frozen so no other script in the page can swap the ID or the amounts at runtime.
window.DONATE = Object.freeze({
  upi: "skafif@upi",
  name: "Afif",
  tiers: Object.freeze([
    Object.freeze({ key: "s", label: "Small chai", note: "A quick sip", amount: 8 }),
    Object.freeze({ key: "l", label: "Large chai", note: "The full cup", amount: 12 }),
    Object.freeze({ key: "c", label: "Coffee", note: "Fuel for late nights", amount: 40 }),
    Object.freeze({ key: "m", label: "Lunch", note: "A proper meal", amount: 150 }),
    Object.freeze({ key: "h", label: "Big thanks", note: "You are amazing", amount: 500 }),
  ]),
});
