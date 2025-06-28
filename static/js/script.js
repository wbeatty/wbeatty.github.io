var count = 0;
var cardsRemaining = 260;
var decksUsed = 5;
var betSize = 50;
var trueCount = 0;

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
  window.location.href = "index.html";
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
  document.getElementById("count").textContent = count;
  trueCount = (count / decksUsed).toFixed(2);
  document.getElementById("true-count").textContent = trueCount;
  document.getElementById("cards-remaining").textContent = cardsRemaining;
  updateRecommendedBet();
}

function updateRecommendedBet() {
  const recommendedBet = (parseFloat(trueCount) - 1) * betSize;
  if (recommendedBet <= betSize) {
    document.getElementById("recommended-bet").textContent = betSize;
  } else {
    document.getElementById("recommended-bet").textContent = recommendedBet;
  }
}

function updateSliderValue() {
  const slider = document.getElementById("myRange");
  const sliderValue = document.getElementById("slider-value");
  sliderValue.textContent = slider.value;
}

function updateBetSize() {
  const betSlider = document.getElementById("bet-size");
  const betValue = document.getElementById("bet-size-value");
  betValue.textContent = betSlider.value;
}

function submit() {
  // Save the values to localStorage
  const decks = document.getElementById("myRange").value;
  const bet = document.getElementById("bet-size").value;
  localStorage.setItem("decksUsed", decks);
  localStorage.setItem("betSize", bet);

  window.location.href = "calculator.html";
}

// Initialize calculator page with saved values
function initializeCalculator() {
  // Load saved values from localStorage
  const savedDecks = localStorage.getItem("decksUsed");
  const savedBet = localStorage.getItem("betSize");

  if (savedDecks) {
    decksUsed = parseInt(savedDecks);
    cardsRemaining = decksUsed * 52;
  }

  if (savedBet) {
    betSize = parseInt(savedBet);
  }

  // Update display with loaded values
  updateDisplay();
}

if (window.location.pathname.includes("calculator.html")) {
  initializeCalculator();
}
