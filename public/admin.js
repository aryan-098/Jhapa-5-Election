// ===== Jhapa-5 Admin Panel =====

(function () {
    'use strict';

    let adminPassword = '';

    // ===== LOGIN =====
    document.getElementById('loginForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const pw = document.getElementById('password').value;
        const errorEl = document.getElementById('loginError');

        // Quick check by trying to fetch with password
        try {
            const res = await fetch('/api/votes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw, votes: [] })
            });

            if (res.ok) {
                adminPassword = pw;
                errorEl.textContent = '';
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('adminDashboard').style.display = 'block';
                loadCandidates();
            } else {
                errorEl.textContent = '❌ Incorrect password. Try again.';
                document.getElementById('password').value = '';
                document.getElementById('password').focus();
            }
        } catch (err) {
            errorEl.textContent = '⚠️ Server connection error.';
        }
    });

    // ===== LOGOUT =====
    document.getElementById('logoutBtn').addEventListener('click', function () {
        adminPassword = '';
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('password').value = '';
    });

    // ===== LOAD CANDIDATES =====
    async function loadCandidates() {
        try {
            const res = await fetch('/api/candidates');
            const data = await res.json();
            renderEditCards(data.candidates);
            updateTotal();
        } catch (err) {
            showStatus('Failed to load candidates', 'error');
        }
    }

    // ===== RENDER EDIT CARDS =====
    function renderEditCards(candidates) {
        const grid = document.getElementById('candidatesGrid');
        grid.innerHTML = candidates.map(c => `
      <div class="candidate-edit-card" style="--card-color: ${c.color}">
        <div class="card-header">
          <img src="${c.photo}" alt="${c.name}" class="card-photo" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 50 50%22><rect fill=%22%23334155%22 width=%2250%22 height=%2250%22/><text x=%2225%22 y=%2232%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2218%22>👤</text></svg>'">
          <div class="card-info">
            <h3>${c.name} ${c.isMajor ? '<span class="major-badge">MAJOR</span>' : ''}</h3>
            <p class="party-name">${c.party} — ${c.partyFull}</p>
          </div>
        </div>
        <div class="vote-input-group">
          <label for="votes-${c.id}">Vote Count</label>
          <input type="number" id="votes-${c.id}" data-id="${c.id}" value="${c.votes}" min="0" class="vote-input" placeholder="0">
        </div>
      </div>
    `).join('');

        // Listen for input changes to update total
        grid.querySelectorAll('.vote-input').forEach(input => {
            input.addEventListener('input', updateTotal);
        });
    }

    // ===== UPDATE TOTAL DISPLAY =====
    function updateTotal() {
        const inputs = document.querySelectorAll('.vote-input');
        let total = 0;
        inputs.forEach(input => {
            total += parseInt(input.value) || 0;
        });
        document.getElementById('totalVotesDisplay').textContent = total.toLocaleString();
    }

    // ===== SUBMIT VOTES =====
    document.getElementById('voteForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Updating...';

        const inputs = document.querySelectorAll('.vote-input');
        const votes = [];
        inputs.forEach(input => {
            votes.push({
                id: parseInt(input.dataset.id),
                votes: parseInt(input.value) || 0
            });
        });

        try {
            const res = await fetch('/api/votes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: adminPassword, votes })
            });

            if (res.ok) {
                showStatus('✅ Votes updated successfully! Live dashboard is refreshed.', 'success');
            } else {
                const data = await res.json();
                showStatus('❌ ' + (data.error || 'Failed to update'), 'error');
            }
        } catch (err) {
            showStatus('⚠️ Server connection error', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="btn-icon">📤</span> Update All Votes';
        }
    });

    // ===== STATUS MESSAGE =====
    function showStatus(message, type) {
        const bar = document.getElementById('statusBar');
        const msg = document.getElementById('statusMessage');
        bar.style.display = 'flex';
        bar.className = `status-bar ${type}`;
        msg.textContent = message;
        setTimeout(() => { bar.style.display = 'none'; }, 5000);
    }
})();
