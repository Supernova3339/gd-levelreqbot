# gd-levelreqbot

A "Simple" Level Request Bot For Twitch

# Features
- Subscriber and Viewer queues ( persistent via JSON files )
- Next Command ( go to next level in queue )
- Few commands
- Easy to manage, customizable, configuration files
- Fully rewritten to be cleaner and more customizable
- GD Mode | change your queue to be geometry dash powered
- Sub Mode | enable or disable subscriber queue
- Intuitive updater
- Data Backups

## Usage Instructions

Download all files ( do this if updating as well! no data will be lost) \
[https://downgit.evecalm.com/#/home?url=https://github.com/supernova3339/gd-levelreqbot](https://downgit.evecalm.com/#/home?url=https://github.com/supernova3339/gd-levelreqbot)

Use NodeJS to run the bot \
When updating, please run `npm ci` to install any new dependencies, as well as update existing ones.

Install dependencies with NPM
``` 
npm ci
```

Rename all **.json.example** to **.json**

Run the bot ( if you want keepalive please use `pm2` ) - note that if updating you will experience a restart loop
temporarily.
```
node main.js
```

---

### PM2 example
``` 
pm2 start --no-daemon main.js --watch
```

Used by [Kingsman265](https://twitch.tv/kingsman265_twitch) \
Want your name here? Make an issue and let us know!
