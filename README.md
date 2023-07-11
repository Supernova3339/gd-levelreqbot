# gd-levelreqbot
A Simple Level Request Bot For Twitch

# Features
- Subscriber and Viewer queues ( persistent via JSON files )
- Current Command ( view currently playing level )
- Next Command ( go to next level in queue )
- Few commands
- Gui ( browser or desktop app, not 100% sure and not finished )
- Easy to manage, customizable, configuration file

## Usage Instructions

Download all files
[https://downgit.evecalm.com/#/home?url=https://github.com/supernova3339/gd-levelreqbot](https://downgit.evecalm.com/#/home?url=https://github.com/supernova3339/gd-levelreqbot)

Use NodeJS to run the bot

Install dependencies with NPM
``` 
npm ci
```

Run the bot ( if you want keepalive please use `pm2` )
```
node main.js
```

---

### PM2 example
``` 
pm2 start main.js
```
