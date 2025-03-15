document.addEventListener("DOMContentLoaded", function () {
  const resultDiv = document.getElementById("result");
  const errorDiv = document.getElementById("error");
  const loadingDiv = document.querySelector(".loading");
  const loadingText = document.querySelector(".loading-text");
  const progressBar = document.getElementById("progressBar");
  const calculateBtn = document.getElementById("calculateBtn");
  const orderCountDiv = document.getElementById("orderCount");
  const avgOrderDiv = document.getElementById("avgOrder");

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

      if (!tab.url.includes("m.rapido.bike/my-rides")) {
        throw new Error("Please navigate to the Rapido Orders page first");
      }

      // Get the token from cookies
      const tokenCookie = await chrome.cookies.get({
        url: "https://m.rapido.bike",
        name: "token",
      });

      console.log("tokenCookie", tokenCookie);

      if (!tokenCookie) {
        throw new Error("Please login to Rapido first");
      }

      const token = tokenCookie.value;

      progressBar.style.width = "15%";

      let totalAmount = 0;
      let rideCount = 0;
      let hasMoreData = true;
      let offset = 0;
      const limit = 50;
      let maxIterations = 10; // Safety limit
      let currentIteration = 0;

      while (hasMoreData && currentIteration < maxIterations) {
        try {
          console.log(`Fetching batch with offset ${offset}...`);

          // Update loading message and progress
          loadingText.textContent = `Calculating...`;
          const progressPercentage = Math.min(
            15 + (currentIteration / maxIterations) * 70,
            85
          );
          progressBar.style.width = `${progressPercentage}%`;

          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (offset, limit, token) => {
              const response = await fetch(
                "https://m.rapido.bike/pwa/api/order",
                {
                  method: "POST",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    limit: limit,
                    offset: offset,
                  }),
                }
              );

              if (!response.ok) {
                throw new Error(`Failed to fetch rides: ${response.status}`);
              }

              return await response.json();
            },
            args: [offset, limit, token],
          });

          console.log("result", result);

          const data = result[0].result;
          console.log("Data received:", data.data.data.orders);

          // Check if we have valid data
          if (
            !data ||
            !data.data ||
            !data.data.data ||
            !data.data.data.orders ||
            data.data.data.orders.length === 0
          ) {
            console.log("No more rides or end of list reached");
            hasMoreData = false;
            break;
          }
          // Process ride data
          data.data.data.orders.forEach((order) => {
            console.log("order", order);
            if (true) {
              // Rapido API might have the amount in different format than Ola
              // Assuming the amount is either directly available as order.amount or needs to be processed
              let rideAmount = 0;

              // Check if the amount is available directly
              if (typeof order.subTotal === "number") {
                rideAmount = order.subTotal;
              } else if (typeof order.subTotal === "string") {
                // Remove non-numeric characters and convert to float
                rideAmount =
                  parseFloat(order.subTotal.replace(/[^\d.]/g, "")) || 0;
              }

              totalAmount += rideAmount;
              rideCount++;
              console.log(
                `Added ride: ${
                  order.uniqueId || order._id
                }, amount: ${rideAmount}`
              );
            }
          });

          // Check if we have more data to fetch
          // This depends on Rapido's API. We're assuming there's more data if:
          // 1. We received the full limit of items
          // 2. The API response indicates there's more (meta.totalCount > offset + received orders)
          const receivedCount = data.data.data.orders.length;
          const totalCount =
            data.data.data.meta && data.data.data.meta.totalCount
              ? data.data.data.meta.totalCount
              : 0;

          if (
            receivedCount < limit ||
            (totalCount > 0 && offset + receivedCount >= totalCount)
          ) {
            hasMoreData = false;
          } else {
            offset += limit;
          }

          currentIteration++;

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch (error) {
          console.error("Error fetching rides:", error);
          throw new Error("Error fetching rides: " + error.message);
        }
      }

      progressBar.style.width = "95%";

      // Calculate averages and format values
      const totalInRupees = totalAmount.toFixed(2);
      const avgOrderAmount =
        rideCount > 0 ? (totalAmount / rideCount).toFixed(2) : "0";

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
      orderCountDiv.textContent = rideCount;
      avgOrderDiv.innerHTML = `<span class="rupee-icon">&#x20B9;</span> ${avgOrderAmount}`;

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
