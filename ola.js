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

      if (!tab.url.includes("book.olacabs.com/your-rides")) {
        throw new Error("Please navigate to the Ola Rides page first");
      }

      // Get all necessary cookies
      const OSRN_v1 = await chrome.cookies.get({
        url: "https://book.olacabs.com",
        name: "OSRN_v1",
      });

      const AKA_A2 = await chrome.cookies.get({
        url: "https://book.olacabs.com",
        name: "AKA_A2",
      });

      const _csrf = await chrome.cookies.get({
        url: "https://book.olacabs.com",
        name: "_csrf",
      });

      const XSRF_TOKEN = await chrome.cookies.get({
        url: "https://book.olacabs.com",
        name: "XSRF-TOKEN",
      });

      const wasc = await chrome.cookies.get({
        url: "https://book.olacabs.com",
        name: "wasc",
      });

      if (!OSRN_v1 || !AKA_A2 || !_csrf || !XSRF_TOKEN || !wasc) {
        throw new Error("Please login to Ola first");
      }

      const cookieString = `OSRN_v1=${OSRN_v1.value}; AKA_A2=${AKA_A2.value}; wasc=${wasc.value}; _csrf=${_csrf.value}; XSRF-TOKEN=${XSRF_TOKEN.value}`;

      if (
        cookieString ===
        "OSRN_v1=-K9gCaW3QBwqnXnqw_88y31I; AKA_A2=A; wasc=web-2aa2e3bd-e781-4914-972a-3f2f3cfe3627__AQECAHgfxP3kLfatAqX5D3Wm8Q4cwpCiqFMlbQIth8I9m4HyQQAAANswgdgGCSqGSIb3DQEHBqCByjCBxwIBADCBwQYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwoPtJPKyIvOfdP7LsCARCAgZPnNSOm1wN7gwHTvY4zmlFXlRMlTSKbKJQhtuvnckm1ApwcFY%2FflzBbcFe08yUwLTY8xsI6UPGRl0ecfrLedNTm4IQOKGnixQuGBG1cQo8P26nMM44fgJcQeb3IExp1%2Bo%2Bn%2BrGg1%2Ff4R5AD5MF1GSzbuhwic7V9wLoTiX8wUokMMdM3mPmrDDkJ%2FXQUl9%2FgeaY28fI%3D; _csrf=v8e9SVozXUdJgqcB7Qf7JbIt; XSRF-TOKEN=rSUgxzuW-vZ9nFSALUtXDUN7OVTGRSG64Bh8"
      ) {
        console.log("Yeses", cookieString);
      }

      progressBar.style.width = "15%";

      let totalAmount = 0;
      let rideCount = 0;
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
            func: async (pageNum, cookieStr) => {
              const response = await fetch(
                `https://book.olacabs.com/pwa-api/rides?pageNumber=${pageNum}`,
                {
                  method: "GET",
                  credentials: "include",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Cookie: cookieStr,
                  },
                }
              );

              console.log("response.headers", response);

              if (!response.ok) {
                throw new Error(`Failed to fetch rides: ${response.status}`);
              }

              return await response.json();
            },
            args: [page, cookieString],
          });

          console.log("result", result);

          const data = result[0].result;
          console.log("Data received:", data);

          if (!data || !data.data || data.data.rides.length === 0) {
            console.log("No more rides or end of list reached");
            endOfList = true;
            break;
          }

          data.data.rides.forEach((ride) => {
            if (ride.status === "COMPLETED") {
              const totalFareNumber = ride.totalFare.replace(/[^\d.]/g, ""); // Remove non-numeric characters
              const totalFareNumberNumber = parseFloat(totalFareNumber) || 0; // Ensure it parses to a number
              totalAmount += totalFareNumberNumber;

              rideCount++;
              console.log(
                `Added ride: ${ride.bookingId}, amount: ${totalFareNumberNumber}`
              );
            }
          });

          endOfList = !data.data.hasNextPage;
          page++;

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
