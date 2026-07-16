
function setupWizard() {
  return {
    currentStep: 0,
    steps: [
      { name: 'Welcome' },
      { name: 'Twitch Auth' },
      { name: 'API Setup' },
      { name: 'Queue Config' },
      { name: 'Commands' },
      { name: 'Finish' }
    ],
    config: {
      auth: {},
      modes: {},
      limits: {},
      commandOverrides: {}
    },
    connectionResult: '',
    connectionSuccess: false,
    testingConnection: false,
    finishingSetup: false,
    
    init() {
      // Load current configuration
      fetch('/api/setup/config')
        .then(response => response.json())
        .then(data => {
          this.config = data;
        })
        .catch(error => {
          console.error('Error loading configuration:', error);
        });
    },
    
    canProceed() {
      switch(this.currentStep) {
        case 0: // Welcome
          return true;
          
        case 1: // Twitch Auth
          return this.config.auth.botUsername && 
                 this.config.auth.botToken && 
                 this.config.auth.channel;
          
        case 2: // API Setup
          return this.config.auth.TwitchClientID && 
                 this.config.auth.TwitchClientSecret && 
                 this.config.auth.WebAPIToken;
          
        case 3: // Queue Config
          return this.config.limits.viewerRequestLimit > 0 && 
                 this.config.limits.subscriberRequestLimit > 0;
          
        case 4: // Commands
          return true;
          
        default:
          return true;
      }
    },
    
    testTwitchConnection() {
      if (!this.config.auth.botUsername || !this.config.auth.botToken || !this.config.auth.channel) {
        this.connectionResult = 'Please fill in all required fields first';
        this.connectionSuccess = false;
        return;
      }
      
      this.testingConnection = true;
      this.connectionResult = '';
      
      // Save the current auth config first
      fetch('/api/setup/config/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config.auth)
      })
      .then(response => {
        if (!response.ok) throw new Error('Failed to save configuration');
        return fetch('/api/setup/test-twitch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botUsername: this.config.auth.botUsername,
            botToken: this.config.auth.botToken,
            channel: this.config.auth.channel
          })
        });
      })
      .then(response => response.json())
      .then(data => {
        this.connectionResult = data.message;
        this.connectionSuccess = data.success;
        this.testingConnection = false;
      })
      .catch(error => {
        this.connectionResult = 'Connection test failed: ' + error.message;
        this.connectionSuccess = false;
        this.testingConnection = false;
      });
    },
    
    generateApiToken() {
      fetch('/api/setup/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(response => response.json())
      .then(data => {
        this.config.auth.WebAPIToken = data.token;
      })
      .catch(error => {
        console.error('Error generating token:', error);
      });
    },
    
    saveCurrentStep() {
      const configType = Object.keys(this.config)[this.currentStep - 1];
      if (!configType) return Promise.resolve();
      
      return fetch(`/api/setup/config/${configType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.config[configType])
      });
    },
    
    finishSetup() {
      this.finishingSetup = true;
      
      // Save all configurations one by one
      Promise.all([
        fetch('/api/setup/config/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.config.auth)
        }),
        fetch('/api/setup/config/modes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.config.modes)
        }),
        fetch('/api/setup/config/limits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.config.limits)
        }),
        fetch('/api/setup/config/commandOverrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.config.commandOverrides)
        })
      ])
      .then(() => {
        return fetch('/api/setup/finish', {
          method: 'POST'
        });
      })
      .then(response => response.json())
      .then(data => {
        console.log(data.message);
        // The server will shut down and restart the main app
      })
      .catch(error => {
        console.error('Error finishing setup:', error);
        this.finishingSetup = false;
      });
    }
  };
}