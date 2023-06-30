# gd-levelreqbot
A Simple Level Request Bot For Twitch

# Features
- Subscriber and Viewer queues
- Current Command ( view currently playing level )
- Next Command ( go to next level in queue )
- Few commands
- Gui ( browser or desktop app, not 100% sure and not finished )
- Easy to manage, customizable, configuration file

## Usage Instructions

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
