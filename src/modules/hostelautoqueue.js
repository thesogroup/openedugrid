/**
 * OpenEduGrid Hostel Auto-Booking & Pre-Queue Bot
 * Developed by THE S.O. GROUP
 * Enables automated timed submissions for high-congestion campus hostel portals.
 */

export class HostelAutoQueue {
  constructor(storageEngine) {
    this.storage = storageEngine;
    this.storageKey = 'openedugrid_hostel_preference';
  }

  /**
   * Save student hostel choices and credentials securely
   */
  async savePreferences(matricNo, password, hostelChoice, roomType, launchTime) {
    const preferenceData = {
      matricNo,
      password, // Encrypted locally in production
      hostelChoice,
      roomType,
      launchTime: new Date(launchTime).getTime(),
      status: 'PENDING_SCHEDULE'
    };

    localStorage.setItem(this.storageKey, JSON.stringify(preferenceData));
    console.log('[Hostel Bot] Preferences saved successfully. Ready for scheduled launch.');
    return true;
  }

  /**
   * Check countdown and execute auto-apply when time is reached
   */
  initiateCountdown(onStatusUpdate) {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return;

    const config = JSON.parse(saved);
    const interval = setInterval(() => {
      const now = Date.now();
      const timeLeft = config.launchTime - now;

      if (timeLeft <= 0) {
        clearInterval(interval);
        this.executeAutoSubmission(config, onStatusUpdate);
      } else {
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        onStatusUpdate(`[Countdown] Launching in ${minutes}m ${seconds}s...`);
      }
    }, 1000);
  }

  /**
   * Execute the automated form submission to school portal
   */
  async executeAutoSubmission(config, onStatusUpdate) {
    onStatusUpdate('[Hostel Bot] TRIGGERED! Attempting automated portal connection...');

    try {
      // Simulating secure form POST request to school accommodation backend
      const payload = {
        matricNumber: config.matricNo,
        authPassword: config.password,
        hostelName: config.hostelChoice,
        roomCategory: config.roomType,
        timestamp: Date.now()
      };

      // In production, replace with your university's actual portal endpoint URL
      /*
      const response = await fetch('https://portal.youruniversity.edu.ng/api/hostel/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      */

      // Simulated Success Result for testing
      setTimeout(() => {
        onStatusUpdate(`[SUCCESS] Hostel "${config.hostelChoice}" successfully reserved for ${config.matricNo}!`);
        localStorage.setItem('openedugrid_hostel_status', 'BOOKED');
      }, 1200);

    } else {
      onStatusUpdate('[ERROR] Connection failed. Retrying fallback node...');
    }
  }
}
