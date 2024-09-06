# gd-levelreqbot

A "Simple" Level Request Bot For Twitch \
Hi Gumroad! Supernova3339 here. feel free to check through the codebase, everything is open source! Cloud will be as well, upon completion.

# Features
- Subscriber and Viewer queues ( persistent via JSON files )
- Next Command ( go to next level in queue )
- Few commands
- Easy to manage, customizable, configuration files
- Fully rewritten to be cleaner and more customizable
- GD Mode | change your queue to be geometry dash powered
- Sub Mode | enable or disable subscriber queue
- Smart Mode | add smart features to improve your users experience
- Intuitive updater
- Data Backups
- Full Web API

## Usage Instructions

Download all files ( do this if updating as well! no data will be lost) \
[https://downgit.evecalm.com/#/home?url=https://github.com/supernova3339/gd-levelreqbot](https://downgit.evecalm.com/#/home?url=https://github.com/supernova3339/gd-levelreqbot)

Use NodeJS to run the bot \
When updating, please run `npm ci` to install any new dependencies, as well as update existing ones.

Install dependencies with NPM
``` 
npm ci
```

Rename all **.json.example** files to **.json**

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

The API is on port **24363**, eg `http://localhost:24363/api` \
For API Documentation, Please Import the following json into [hoppscotch.io](https://hoppscotch.io) ↓
```json
{
  "v": 3,
  "name": "GD-LevelReqBot-NCBAPI",
  "folders": [
    {
      "v": 3,
      "name": "Queue",
      "folders": [],
      "requests": [
        {
          "preRequestScript": "",
          "v": "7",
          "requestVariables": [],
          "body": {
            "body": null,
            "contentType": null
          },
          "endpoint": "http://localhost:24363/api/queue/clear",
          "headers": [],
          "auth": {
            "authActive": true,
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w",
            "authType": "inherit"
          },
          "params": [],
          "name": "Clear Entire Queue",
          "method": "POST",
          "testScript": ""
        },
        {
          "body": {
            "body": "{\n  \"id\": \"109817131\"\n}",
            "contentType": "application/json"
          },
          "preRequestScript": "",
          "requestVariables": [],
          "v": "7",
          "testScript": "",
          "name": "Delete From Queue",
          "auth": {
            "authType": "inherit",
            "authActive": true,
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w"
          },
          "headers": [],
          "endpoint": "http://localhost:24363/api/queue/delete",
          "params": [],
          "method": "DELETE"
        },
        {
          "method": "POST",
          "name": "Get Queue Position",
          "params": [],
          "testScript": "",
          "requestVariables": [],
          "preRequestScript": "",
          "body": {
            "body": "{\n  \"id\": \"109817131\"\n}",
            "contentType": "application/json"
          },
          "v": "7",
          "auth": {
            "addTo": "HEADERS",
            "authType": "inherit",
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w",
            "authActive": true
          },
          "headers": [],
          "endpoint": "http://localhost:24363/api/queue/position"
        },
        {
          "requestVariables": [],
          "endpoint": "http://localhost:24363/api/queue/add",
          "params": [],
          "name": "Add To Queue",
          "method": "POST",
          "body": {
            "contentType": "application/json",
            "body": "{\n  \"id\": 109817131,\n  \"name\": \"youtheman12221\",\n  \"isSubscriber\": true\n}"
          },
          "preRequestScript": "",
          "testScript": "",
          "v": "7",
          "headers": [],
          "auth": {
            "authActive": true,
            "authType": "inherit",
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w"
          }
        },
        {
          "name": "Next In Queue",
          "v": "7",
          "method": "POST",
          "preRequestScript": "",
          "params": [],
          "requestVariables": [],
          "body": {
            "body": null,
            "contentType": null
          },
          "auth": {
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w",
            "authType": "inherit",
            "authActive": true
          },
          "testScript": "",
          "endpoint": "http://localhost:24363/api/queue/next",
          "headers": []
        },
        {
          "requestVariables": [],
          "auth": {
            "authActive": true,
            "authType": "bearer",
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w"
          },
          "method": "POST",
          "headers": [],
          "endpoint": "http://localhost:24363/api/queue/list",
          "v": "7",
          "body": {
            "body": "{\n  \"page\": 1,\n  \"items\": 5,\n  \"queueType\": \"viewer\"\n}",
            "contentType": "application/json"
          },
          "name": "List Items From Queue",
          "preRequestScript": "",
          "params": [],
          "testScript": ""
        }
      ],
      "auth": {
        "authActive": true,
        "authType": "inherit"
      },
      "headers": []
    },
    {
      "v": 3,
      "name": "System",
      "folders": [],
      "requests": [
        {
          "requestVariables": [],
          "params": [],
          "v": "7",
          "name": "Check For Bot Client Updates",
          "headers": [],
          "body": {
            "body": null,
            "contentType": null
          },
          "endpoint": "http://localhost:24363/api/system/checkForUpdates",
          "auth": {
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w",
            "authActive": true,
            "authType": "inherit"
          },
          "method": "GET",
          "preRequestScript": "",
          "testScript": ""
        },
        {
          "endpoint": "http://localhost:24363/api/system/listServerCommands",
          "body": {
            "contentType": null,
            "body": null
          },
          "name": "List Bot Client Commands",
          "testScript": "",
          "method": "GET",
          "params": [],
          "headers": [],
          "v": "7",
          "requestVariables": [],
          "preRequestScript": "",
          "auth": {
            "authActive": true,
            "authType": "inherit",
            "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI5ODQyOTAzOTA0IiwiYXVkIjoiODQzMjkyMzkwNCIsImV4cCI6bnVsbCwidWlkIjoiNDcyODQ0MjM5NDcifQ.7eGOaSwWJ22G3PEG8w3UNzaJj0yAc-hLz_jlnTQuB3w"
          }
        }
      ],
      "auth": {
        "authActive": true,
        "authType": "inherit"
      },
      "headers": []
    }
  ],
  "requests": [],
  "auth": {
    "token": "your-secure-api-token-goes-here",
    "authActive": true,
    "authType": "bearer"
  },
  "headers": []
}
```

