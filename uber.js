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

      if (!tab.url.includes("riders.uber.com")) {
        throw new Error("Please navigate to the Uber Trips page first");
      }

      // List of required cookies for Uber API authentication
      const requiredCookies = [
        "sid",
        "jwt-session",
        "csid",
        "udi-id",
        "GEOIP_CITY_ID_COOKIE",
        "udi-fingerprint",
        "marketing_vistor_id",
      ];

      // Get only the required cookies
      const authCookies = await Promise.all(
        requiredCookies.map((name) =>
          chrome.cookies.get({
            url: "https://riders.uber.com",
            name: name,
          })
        )
      );

      // Check if we have at least the critical cookies
      const criticalCookies = ["sid", "jwt-session"];
      const hasCriticalCookies = criticalCookies.every((name) => {
        return authCookies.some((cookie) => cookie && cookie.name === name);
      });

      if (!hasCriticalCookies) {
        throw new Error("Please login to Uber first");
      }

      // Format cookies for header (only the ones that exist)
      const cookieHeader = authCookies
        .filter((cookie) => cookie !== null)
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");

      console.log("Using cookie header:", cookieHeader);

      progressBar.style.width = "15%";

      let totalAmount = 0;
      let rideCount = 0;
      let hasMoreData = true;
      let nextPageToken = null;
      const limit = 20; // Number of rides to fetch per request
      let maxIterations = 10; // Safety limit
      let currentIteration = 0;

      while (hasMoreData && currentIteration < maxIterations) {
        try {
          console.log(`Fetching batch ${currentIteration + 1}...`);

          // Update loading message and progress
          loadingText.textContent = `Calculating... Batch ${
            currentIteration + 1
          }`;
          const progressPercentage = Math.min(
            15 + (currentIteration / maxIterations) * 70,
            85
          );
          progressBar.style.width = `${progressPercentage}%`;

          // GraphQL query payload
          const graphqlPayload = {
            operationName: "Activities",
            variables: {
              includePast: true,
              includeUpcoming: false,
              limit: limit,
              orderTypes: ["RIDES", "TRAVEL"],
              profileType: "PERSONAL",
            },
            query: `query Activities($cityID: Int, $endTimeMs: Float, $includePast: Boolean = true, $includeUpcoming: Boolean = true, $limit: Int = 5, $nextPageToken: String, $orderTypes: [RVWebCommonActivityOrderType!] = [RIDES, TRAVEL], $profileType: RVWebCommonActivityProfileType = PERSONAL, $startTimeMs: Float) {
      activities(cityID: $cityID) {
        cityID
        past(
          endTimeMs: $endTimeMs
          limit: $limit
          nextPageToken: $nextPageToken
          orderTypes: $orderTypes
          profileType: $profileType
          startTimeMs: $startTimeMs
        ) @include(if: $includePast) {
          activities {
            ...RVWebCommonActivityFragment
            __typename
          }
          nextPageToken
          __typename
        }
        upcoming @include(if: $includeUpcoming) {
          activities {
            ...RVWebCommonActivityFragment
            __typename
          }
          __typename
        }
        __typename
      }
    }
    
    fragment RVWebCommonActivityFragment on RVWebCommonActivity {
      buttons {
        isDefault
        startEnhancerIcon
        text
        url
        __typename
      }
      cardURL
      description
      imageURL {
        light
        dark
        __typename
      }
      subtitle
      title
      uuid
      __typename
    }`,
          };

          // Add nextPageToken if we have one
          if (nextPageToken) {
            graphqlPayload.variables.nextPageToken = nextPageToken;
          }

          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (graphqlPayload, cookieHeader) => {
              try {
                const response = await fetch(
                  "https://riders.uber.com/graphql",
                  {
                    method: "POST",
                    headers: {
                      Accept: "application/json",
                      "Content-Type": "application/json",
                      Cookie: cookieHeader,
                      "x-csrf-token": "x",
                    },
                    body: JSON.stringify(graphqlPayload),
                  }
                );

                if (!response.ok) {
                  throw new Error(`Failed to fetch rides: ${response.status}`);
                }

                return await response.json();
              } catch (error) {
                console.error("Fetch error:", error);
                return { error: error.message };
              }
            },
            args: [graphqlPayload, cookieHeader],
          });

          console.log("GraphQL result:", result);

          // Check if there was an error in the executeScript call
          if (result[0].result.error) {
            throw new Error(`API error: ${result[0].result.error}`);
          }

          const data = result[0].result;

          // Check if we have valid data
          if (
            !data ||
            !data.data ||
            !data.data.activities ||
            !data.data.activities.past ||
            !data.data.activities.past.activities
          ) {
            console.log("No more rides or invalid response");
            hasMoreData = false;
            break;
          }

          const activities = data.data.activities.past.activities;
          console.log("Activities:", activities);

          // Process each activity/ride
          for (const activity of activities) {
            console.log("Processing activity:", activity);

            // Skip cancelled rides
            if (
              (activity.title &&
                activity.title.toLowerCase().includes("cancelled")) ||
              (activity.subtitle &&
                activity.subtitle.toLowerCase().includes("cancelled")) ||
              (activity.description &&
                activity.description.toLowerCase().includes("cancelled"))
            ) {
              console.log(`Skipping cancelled ride: ${activity.uuid}`);
              continue;
            }

            // Try multiple approaches to extract the price
            let amount = 0;

            // Method 1: Try to extract from description (most common)
            if (activity.description) {
              console.log("Description:", activity.description);

              amount = parseFloat(
                activity.description
                  .split(/[^0-9.]/)
                  .filter(Boolean)
                  .join("")
              );
              console.log(`Found amount in description: ${amount}`);
            }

            // If we found a valid amount, add it to the total
            if (!isNaN(amount) && amount > 0) {
              totalAmount += amount;
              rideCount++;
              console.log(
                `Added ride: ${
                  activity.uuid || "unknown"
                }, amount: Rs.${amount}`
              );
            } else {
              console.log(
                `Could not extract amount for ride: ${
                  activity.uuid || "unknown"
                }`
              );

              // If no amount found but seems to be a completed ride, log the full activity for debugging
              if (!activity.title?.toLowerCase().includes("cancelled")) {
                console.log(
                  "Full activity with no extractable amount:",
                  JSON.stringify(activity, null, 2)
                );
              }
            }
          }

          // Check if we have more pages to fetch
          nextPageToken = data.data.activities.past.nextPageToken;
          if (!nextPageToken) {
            hasMoreData = false;
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
          resultDiv.innerHTML = `<span class="rupee-icon">Rs.</span>${current.toLocaleString(
            "en-IN",
            {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }
          )}`;

          if (current >= to) {
            resultDiv.innerHTML = `<span class="rupee-icon">Rs.</span>${parseFloat(
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
      avgOrderDiv.innerHTML = `<span class="rupee-icon">Rs.</span>${avgOrderAmount}`;

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
