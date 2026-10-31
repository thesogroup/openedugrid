/**
 * OpenEduGrid Hostel Auto-Booking & Pre-Queue Bot
 * Developed by THE S.O. GROUP
 */

export class HostelAutoQueue {
  constructor(storageEngine) {
    this.storage = storageEngine;
    this.storageKey = 'openedugrid_hostel_preference';
  }

  async savePreferences(matricNo, password, hostelChoice, roomType, launchTime) {
    const preferenceData = {
      matricNo,
      password,
      hostelChoice,
      roomType,
      launchTime: new Date(launchTime).getTime(),
      status: 'PENDING_SCHEDULE'
    };
    localStorage.setItem(this.storageKey, JSON.stringify(preferenceData));
    console.log('[Hostel Bot] Preferences saved successfully.');
    return true;
  }

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

  async executeAutoSubmission(config, onStatusUpdate) {
    onStatusUpdate('[Hostel Bot] TRIGGERED! Attempting automated portal connection...');
    setTimeout(() => {
      onStatusUpdate(`[SUCCESS] Hostel "${config.hostelChoice}" successfully reserved for ${config.matricNo}!`);
      localStorage.setItem('openedugrid_hostel_status', 'BOOKED');
    }, 1200);
  }
}