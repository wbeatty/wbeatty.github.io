var count = 0;
var cardsRemaining = 260;
var decksUsed = 5;

function add() {
  count += 1;
  cardsRemaining -= 1;
  checkDeckChange();
  updateDisplay();
}

function subtract() {
  count -= 1;
  cardsRemaining -= 1;
  checkDeckChange();
  updateDisplay();
}

function reset() {
  count = 0;
  cardsRemaining = 52 * decksUsed;
  updateDisplay();
}

function checkDeckChange() {
  const newDecksUsed = Math.ceil(cardsRemaining / 52);
  if (newDecksUsed < decksUsed) {
    decksUsed = newDecksUsed;
    // Update the slider to reflect the new number of decks
    document.getElementById("myRange").value = decksUsed;
    document.getElementById("slider-value").textContent = decksUsed;
  }
}

function updateDisplay() {
  const slider = document.getElementById("myRange");
  document.getElementById("count").textContent = count;
  document.getElementById("true-count").textContent = (
    count / decksUsed
  ).toFixed(2);
  document.getElementById("cards-remaining").textContent = cardsRemaining;
}

function updateSliderValue() {
  const slider = document.getElementById("myRange");
  const sliderValue = document.getElementById("slider-value");
  sliderValue.textContent = slider.value;
  decksUsed = slider.value;
  cardsRemaining = decksUsed * 52;
  updateDisplay();
}

window.onload = function () {
  updateSliderValue();
};
