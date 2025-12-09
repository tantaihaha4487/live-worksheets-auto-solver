# live-worksheets-auto-solver
Auto solve live worksheets with js


# How to use
1. `F12` go to Console
2. copy this code
 ```js
 (function () {
  console.clear();
  console.log("🚀 Starting Smart Auto-Solver v3...");

  try {
      // 1. Get and Parse Worksheet Data
      if (!drupalSettings || !drupalSettings.worksheet || !drupalSettings.worksheet.json) {
          throw new Error("❌ Worksheet data not found. Make sure you are on the worksheet page.");
      }
      
      const rawData = JSON.parse(drupalSettings.worksheet.json);
      
      // 2. Extract and Sort Answers from JSON
      // We only care about fields that require an answer (contain "choose:")
      let answerKey = [];
      
      rawData.forEach((field, index) => {
          const content = field[0] || "";
          const top = parseInt(field[1]);
          const left = parseInt(field[2]);

          // Check if it's a Dropdown (choose:)
          if (content.startsWith("choose:")) {
              // Split options and find the one with '*'
              const options = content.substring(7).split('/');
              const correctOption = options.find(opt => opt.startsWith('*'));
              
              if (correctOption) {
                  answerKey.push({
                      index: index,
                      answer: correctOption.substring(1).trim(), // Remove '*'
                      top: top,
                      left: left
                  });
              }
          }
      });

      // Sort Answer Key by Position: Top-to-Bottom, then Left-to-Right
      answerKey.sort((a, b) => {
          if (Math.abs(a.top - b.top) > 10) return a.top - b.top; // Different rows
          return a.left - b.left; // Same row, sort left to right
      });

      console.log(`📋 Found ${answerKey.length} answers in the key.`);

      // 3. Find and Sort DOM Elements (Dropdowns)
      // We select all dropdowns inside the worksheet preview area
      const domSelects = Array.from(document.querySelectorAll('#worksheet-preview select'));
      
      if (domSelects.length === 0) {
          throw new Error("❌ No dropdowns (<select>) found on the page.");
      }

      // Sort Elements by Screen Position: Top-to-Bottom, then Left-to-Right
      domSelects.sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          
          if (Math.abs(rectA.top - rectB.top) > 10) return rectA.top - rectB.top;
          return rectA.left - rectB.left;
      });

      console.log(`🔍 Found ${domSelects.length} dropdowns on the screen.`);

      // 4. Map and Fill Answers
      let matchCount = 0;
      const maxLoop = Math.min(answerKey.length, domSelects.length);

      for (let i = 0; i < maxLoop; i++) {
          const targetEl = domSelects[i];
          const targetAns = answerKey[i].answer;

          // Loop through the dropdown options to find the matching text
          let foundOption = false;
          for (let j = 0; j < targetEl.options.length; j++) {
              // Normalize text (trim spaces) for comparison
              const optionText = targetEl.options[j].text.trim();
              
              // Check for exact match or if the option starts with the answer
              // (Using startsWith helps if there are extra spaces or hidden chars)
              if (optionText === targetAns || optionText.startsWith(targetAns.substring(0, 20))) {
                  targetEl.selectedIndex = j;
                  foundOption = true;
                  break;
              }
          }

          if (foundOption) {
              // Trigger events so the site saves the answer
              targetEl.dispatchEvent(new Event('change', { bubbles: true }));
              targetEl.dispatchEvent(new Event('input', { bubbles: true }));
              
              // Visual Feedback (Green Border)
              targetEl.style.border = "3px solid #00cc66";
              targetEl.style.backgroundColor = "#eafff2";
              matchCount++;
          } else {
              console.warn(`⚠️ Could not find option text "${targetAns.substring(0, 15)}..." in Dropdown #${i+1}`);
              targetEl.style.border = "3px solid orange"; // Mark problematic ones orange
          }
      }

      // 5. Final Report
      if (matchCount > 0) {
          console.log(`✅ Success! Filled ${matchCount} dropdowns.`);
          alert(`✅ Filled ${matchCount} answers!\nCheck the green boxes and click Finish.`);
      } else {
          console.error("❌ No matches made. Text in JSON might not match Dropdown text.");
          alert("Script ran but couldn't match text options. See console for details.");
      }

  } catch (e) {
      console.error("⛔ Script Error:", e);
      alert(e.message);
  }
})();
```

3. Press enter then push finish buttton on live-worksheets!
