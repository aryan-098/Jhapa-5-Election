// ===== Jhapa-5 Live Election Dashboard =====

(function () {
    'use strict';

    let currentData = null;
    let eventSource = null;
    let reconnectInterval = null;

    // ===== ANIMATED BACKGROUND PARTICLES =====
    function createParticles() {
        const container = document.getElementById('bgParticles');
        for (let i = 0; i < 40; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDuration = (8 + Math.random() * 15) + 's';
            particle.style.animationDelay = Math.random() * 10 + 's';
            particle.style.width = (2 + Math.random() * 4) + 'px';
            particle.style.height = particle.style.width;
            container.appendChild(particle);
        }
    }

    // ===== NUMBER ANIMATION =====
    function animateNumber(element, targetValue) {
        const currentValue = parseInt(element.textContent.replace(/,/g, '')) || 0;
        if (currentValue === targetValue) return;

        const duration = 800;
        const startTime = performance.now();

        function update(timestamp) {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = Math.round(currentValue + (targetValue - currentValue) * eased);
            element.textContent = value.toLocaleString();

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = targetValue.toLocaleString();
                element.classList.add('vote-flash');
                setTimeout(() => element.classList.remove('vote-flash'), 600);
            }
        }

        requestAnimationFrame(update);
    }

    // ===== RENDER CANDIDATES =====
    function renderCandidates(data) {
        const majorContainer = document.getElementById('majorCandidates');
        const minorContainer = document.getElementById('minorCandidates');

        const majorCandidates = data.candidates.filter(c => c.isMajor);
        const minorCandidates = data.candidates.filter(c => !c.isMajor);

        // Find leading candidate
        const maxVotes = Math.max(...data.candidates.map(c => c.votes));
        const hasAnyVotes = maxVotes > 0;

        // Update stats
        // Total votes removed because not all candidates are tracked

        if (hasAnyVotes) {
            const leading = data.candidates.find(c => c.votes === maxVotes);
            document.getElementById('leadingParty').textContent = leading.party;
            document.getElementById('leadingParty').style.color = leading.color;
        } else {
            document.getElementById('leadingParty').textContent = '—';
        }

        if (data.lastUpdated) {
            const d = new Date(data.lastUpdated);
            document.getElementById('lastUpdated').textContent = d.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
        }

        // ===== MAJOR CANDIDATES =====
        if (!currentData) {
            // First render — build HTML
            majorContainer.innerHTML = majorCandidates.map(c => {
                const isLeading = hasAnyVotes && c.votes === maxVotes && c.votes > 0;
                return `
          <div class="major-card ${isLeading ? 'leading' : ''}" style="--card-color: ${c.color}" data-id="${c.id}">
            <img src="${c.photo}" alt="${c.name}" class="candidate-photo" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 120%22><rect fill=%22%23334155%22 width=%22120%22 height=%22120%22/><text x=%2260%22 y=%2268%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2240%22>👤</text></svg>'">
            <h3 class="candidate-name">${c.name}</h3>
            <p class="candidate-party">${c.party}</p>
            <div class="vote-count" id="major-votes-${c.id}">${c.votes.toLocaleString()}</div>
            <div class="vote-label">Votes</div>
          </div>`;
            }).join('');
            // Add floating VS badge between the two cards
            majorContainer.insertAdjacentHTML('beforeend', '<div class="vs-floating versus-badge">VS</div>');
        } else {
            // Subsequent renders — update values with animation
            majorCandidates.forEach(c => {
                const isLeading = hasAnyVotes && c.votes === maxVotes && c.votes > 0;

                const card = majorContainer.querySelector(`[data-id="${c.id}"]`);
                if (card) {
                    card.className = `major-card ${isLeading ? 'leading' : ''}`;
                    animateNumber(document.getElementById(`major-votes-${c.id}`), c.votes);
                }
            });
        }

        // ===== MINOR CANDIDATES =====
        if (!currentData) {
            minorContainer.innerHTML = minorCandidates.map(c => {
                return `
          <div class="minor-card" style="--card-color: ${c.color}" data-id="${c.id}">
            <img src="${c.photo}" alt="${c.name}" class="candidate-photo" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22><rect fill=%22%23334155%22 width=%2280%22 height=%2280%22/><text x=%2240%22 y=%2248%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2228%22>👤</text></svg>'">
            <h3 class="candidate-name">${c.name}</h3>
            <p class="candidate-party">${c.party}</p>
            <div class="vote-count" id="minor-votes-${c.id}">${c.votes.toLocaleString()}</div>
            <div class="vote-label">Votes</div>
          </div>`;
            }).join('');
        } else {
            minorCandidates.forEach(c => {
                const card = minorContainer.querySelector(`[data-id="${c.id}"]`);
                if (card) {
                    animateNumber(document.getElementById(`minor-votes-${c.id}`), c.votes);
                }
            });
        }
    }

    // ===== SSE CONNECTION =====
    function connectSSE() {
        const statusEl = document.getElementById('connectionStatus');

        eventSource = new EventSource('/api/stream');

        eventSource.onopen = function () {
            statusEl.className = 'connection-status';
            statusEl.querySelector('.status-text').textContent = 'LIVE';
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }
        };

        eventSource.onmessage = function (event) {
            const data = JSON.parse(event.data);
            renderCandidates(data);
            currentData = data;
        };

        eventSource.onerror = function () {
            statusEl.className = 'connection-status disconnected';
            statusEl.querySelector('.status-text').textContent = 'RECONNECTING...';
            eventSource.close();

            // Retry in 3 seconds
            if (!reconnectInterval) {
                reconnectInterval = setTimeout(() => {
                    reconnectInterval = null;
                    connectSSE();
                }, 3000);
            }
        };
    }

    // ===== INIT =====
    document.addEventListener('DOMContentLoaded', function () {
        createParticles();
        connectSSE();
    });
})();
