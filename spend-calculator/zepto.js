document.addEventListener("DOMContentLoaded", function () {
  const resultDiv = document.getElementById("result");
  const errorDiv = document.getElementById("error");
  const loadingDiv = document.querySelector(".loading");
  const loadingText = document.querySelector(".loading-text");
  const progressBar = document.getElementById("progressBar");
  const calculateBtn = document.getElementById("calculateBtn");
  const orderCountDiv = document.getElementById("orderCount");
  const avgOrderDiv = document.getElementById("avgOrder");
  const avgDeliveryTimeDiv = document.getElementById("avgDeliveryTime");
  const avgItemsDiv = document.getElementById("avgItems");
  const avgRatingDiv = document.getElementById("avgRating");
  const totalItemsDiv = document.getElementById("totalItems");

  // Get instructions and stats grid divs
  const instructionsDiv = document.getElementById("instructions");
  const statsGridDiv = document.getElementById("statsGrid");

  // Initially show the instructions, hide the stats grid
  instructionsDiv.style.display = "block";
  statsGridDiv.style.display = "none";

  calculateBtn.addEventListener("click", async () => {
    // Reset and show loading state
    resultDiv.style.display = "none";
    resultDiv.classList.remove("visible");
    errorDiv.style.display = "none";
    errorDiv.textContent = "";
    loadingDiv.style.display = "block";
    calculateBtn.disabled = true;
    progressBar.style.width = "5%";

    // Hide instructions during calculation
    instructionsDiv.style.display = "none";

    // Show stats grid during calculation
    statsGridDiv.style.display = "grid";

    try {
      // Check if we're on the correct page
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.url.includes("zeptonow.com/account/orders")) {
        throw new Error("Please navigate to the Zepto orders page first");
      }

      // Get all necessary cookies
      const accessTokenCookie = await chrome.cookies.get({
        url: "https://www.zeptonow.com",
        name: "accessToken",
      });

      const refreshTokenCookie = await chrome.cookies.get({
        url: "https://www.zeptonow.com",
        name: "refreshToken",
      });

      if (!accessTokenCookie || !refreshTokenCookie) {
        throw new Error("Please login to Zepto first");
      }

      progressBar.style.width = "15%";

      let totalAmount = 0;
      let orderCount = 0;
      let totalDeliveryTime = 0;
      let totalItems = 0;
      let totalRating = 0;
      let ratedOrderCount = 0;
      let endOfList = false;
      let page = 1;
      let maxPages = 50; // Safety limit

      while (!endOfList && page <= maxPages) {
        try {
          console.log(`Fetching page ${page}...`);

          // Update loading message and progress
          loadingText.textContent = `Calculating...`;
          const progressPercentage = Math.min(15 + (page / maxPages) * 70, 85);
          progressBar.style.width = `${progressPercentage}%`;

          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (pageNum) => {
              const response = await fetch(
                `https://api.zeptonow.com/api/v2/order/?page_number=${pageNum}`,
                {
                  method: "GET",
                  credentials: "include",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                  },
                }
              );

              if (!response.ok) {
                throw new Error(`Failed to fetch orders: ${response.status}`);
              }

              return await response.json();
            },
            args: [page],
          });

          const data = result[0].result;
          console.log("Data received:", data);

          if (!data || !data.orders || data.orders.length === 0) {
            console.log("No more orders or end of list reached");
            endOfList = true;
            break;
          }

          // Calculate statistics from current page
          data.orders.forEach((order) => {
            if (order.status === "DELIVERED") {
              totalAmount += order.grandTotalAmount;

              if (order.totalDeliveryTimeInSeconds) {
                totalDeliveryTime += order.totalDeliveryTimeInSeconds;
              }

              if (order.itemQuantityCount) {
                totalItems += order.itemQuantityCount;
              }

              if (order.rating && !order.ratingSkipped) {
                totalRating += order.rating;
                ratedOrderCount++;
              }

              orderCount++;
              console.log(
                `Added order: ${order.id}, amount: ${order.grandTotalAmount}, items: ${order.itemQuantityCount}, rating: ${order.rating}`
              );
            }
          });

          endOfList = data.endOfList || data.orders.length === 0;
          page++;

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error("Error fetching orders:", error);
          throw new Error("Error fetching orders: " + error.message);
        }
      }

      progressBar.style.width = "95%";

      // Calculate averages and format values
      const totalInRupees = (totalAmount / 100).toFixed(2);
      const avgOrderAmount =
        orderCount > 0 ? (totalAmount / (orderCount * 100)).toFixed(2) : "0";
      const avgDeliveryTimeInMinutes =
        orderCount > 0 ? Math.round(totalDeliveryTime / orderCount / 60) : 0;
      const avgItemsPerOrder =
        orderCount > 0 ? (totalItems / orderCount).toFixed(1) : "0";
      const avgRating =
        ratedOrderCount > 0 ? (totalRating / ratedOrderCount).toFixed(1) : "-";

      // Animate the counting of the total (optional effect)
      const animateCounting = (to, duration = 1500) => {
        const start = 0;
        const increment = to > 1000 ? 100 : 10;
        const stepTime = Math.abs(
          Math.floor((duration / (to - start)) * increment)
        );
        let current = 0;

        const timer = setInterval(() => {
          current += increment;
          resultDiv.innerHTML = `<span class="rupee-icon">&#x20B9;</span> ${current.toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }
          )}`;

          if (current >= to) {
            resultDiv.innerHTML = `<span class="rupee-icon">&#x20B9;</span> ${parseFloat(
              totalInRupees
            ).toLocaleString("en-IN", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}`;
            clearInterval(timer);
          }
        }, stepTime);
      };

      // Update statistics
      orderCountDiv.textContent = orderCount;
      avgOrderDiv.innerHTML = `<span class="rupee-icon">&#x20B9;</span> ${avgOrderAmount}`;
      avgDeliveryTimeDiv.textContent = `${avgDeliveryTimeInMinutes} min`;
      avgItemsDiv.textContent = avgItemsPerOrder;
      avgRatingDiv.innerHTML =
        avgRating !== "-"
          ? `<span class="rupee-icon">&#9733;</span> ${avgRating}`
          : "-";
      totalItemsDiv.textContent = totalItems;

      // Hide loading state
      progressBar.style.width = "100%";
      setTimeout(() => {
        loadingDiv.style.display = "none";
        calculateBtn.disabled = false;

        // Show result with animation
        resultDiv.style.display = "block";
        animateCounting(parseFloat(totalInRupees));
        setTimeout(() => resultDiv.classList.add("visible"), 100);

        // Keep stats grid visible after calculation (don't show instructions)
        statsGridDiv.style.display = "grid";
        instructionsDiv.style.display = "none";
      }, 400);
    } catch (error) {
      // Hide loading state and show error
      loadingDiv.style.display = "none";
      calculateBtn.disabled = false;

      console.error("Error in calculation:", error);
      errorDiv.textContent = error.message;
      errorDiv.style.display = "block";
      resultDiv.style.display = "none";

      // Show instructions again after error, hide stats grid
      instructionsDiv.style.display = "block";
      statsGridDiv.style.display = "none";
    }
  });

  // Add ripple effect to button
  calculateBtn.addEventListener("mousedown", function (event) {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.offsetLeft - diameter / 2}px`;
    circle.style.top = `${event.clientY - button.offsetTop - diameter / 2}px`;
    circle.classList.add("ripple");

    const ripple = button.querySelector(".ripple");
    if (ripple) {
      ripple.remove();
    }

    button.appendChild(circle);
  });

  // Add this CSS for the ripple effect
  const style = document.createElement("style");
  style.textContent = `
    button {
      position: relative;
      overflow: hidden;
    }
    .ripple {
      position: absolute;
      border-radius: 50%;
      background-color: rgba(255, 255, 255, 0.3);
      transform: scale(0);
      animation: ripple 0.6s linear;
      pointer-events: none;
    }
    @keyframes ripple {
      to {
        transform: scale(2.5);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
});
