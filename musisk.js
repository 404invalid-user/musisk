/*
 *
 * you can test it at https://musisk.invaliduser.tk
 * quick before it reaches 100 server
 * 
 */

const Discord = require('discord.js');
const fs = require('fs');
const conf = require('./conf.json');
const url = require('url');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const express = require('express');
const fetch = require('node-fetch');
var bodyParser = require('body-parser');
const app = express();

const queue = new Map();

const client = new Discord.Client();

app.set('view engine', 'ejs')

app.use(bodyParser.urlencoded({
    extended: false
}));

app.use(bodyParser.json());

//get
app.get('/', (req, res) => {
    res.render('index.ejs') //("im a bot login https://discord.com/api/oauth2/authorize?client_id=701167486820941926&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fguilds&response_type=code&scope=identify%20email%20guilds%20guilds.join")
})
app.get('/music', async(req, res) => {

    const urlObj = url.parse(req.url, true);
    if (urlObj.query.code) {

        let userGuilds;
        let mutualGuilds = [];
        let botGuilds = [];
        let channels = {};
        let userInfo;

        let clientGuilds = client.guilds.cache.map(guild => guild.id);


        const accessCode = urlObj.query.code;

        //data to get OAuth2 code
        const data = {
            client_id: conf.clientId,
            client_secret: conf.clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: conf.redirectUri,
            code: accessCode,
            scope: conf.scope,
        };

        let oath;
        //fetch OAuth2 token and asign the data to oath var
        await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams(data),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }).then(discordRes => discordRes.json())
            .then(info => oath = info)

        //fetch user info from OAuth2 token
        await fetch('https://discord.com/api/users/@me', {
                headers: {
                    authorization: `${oath.token_type} ${oath.access_token}`,
                },
            })
            .then(async userRes => {
                userInfo = await userRes.json()
            })

        //fetch guilds from OAuth2 token
        await fetch('https://discord.com/api/users/@me/guilds', {
                headers: {
                    authorization: `${oath.token_type} ${oath.access_token}`,
                },
            })
            .then(async guildRes => {

                userGuilds = await guildRes.json()
            })



        //loop though the bots servers and push it to an aray called 'botGuilds'
        await clientGuilds.forEach(clientGuild => {
                botGuilds.push(clientGuild)
            })
            //loop thought the guilds i gto from the OAuth2 token and see if a guild id matches one on the 'botGuilds' array if it does push its name and id to 'mutualGuilds' array
        await userGuilds.forEach(userGuild => {
            if (botGuilds.includes(userGuild.id)) {
                mutualGuilds.push({ id: userGuild.id, name: userGuild.name })
            }
        })

        //get all the voice channels for each guild in the 'mutualGuilds' array and send the name and id to a temp aray called 'serverChannels' than push that temp array to 'channels' array
        await mutualGuilds.forEach(async mutualGuild => {
            let serverChannels = [];
            let gchannels = client.guilds.cache.get(mutualGuild.id).channels.cache.filter(c => c.type == 'voice')

            await gchannels.forEach(gchannel => {
                serverChannels.push({ id: gchannel.id, name: gchannel.name })
            })
            channels[mutualGuild.id] = serverChannels
        })

        await res.render('music.ejs', { userInfo: userInfo, mutualGuilds: mutualGuilds, channels: channels, error: null })
    } else if (urlObj.query.error) {
        await res.render('music.ejs', { userInfo: null, mutualGuilds: null, channels: null, error: "there has been an error authorising you, please try again if this continuous caontact us." })

    } else {
        await res.render('music.ejs', { userInfo: null, mutualGuilds: null, channels: null, error: "no acces code please authorize your self on the main page." })
    }



})













//posts 
app.get('/gmusic', async(req, res) => {

    const urlObj = url.parse(req.url, true);




    if (client.guilds.cache.get(urlObj.query.serverid).member(urlObj.query.userid)) {
        const serverQueue = queue.get(urlObj.query.serverid);


        const videoPlayer = async(guild, song) => {
            const songQueue = queue.get(guild);
            if (!song) {
                songQueue.voiceChannel.leave();
                queue.delete(guild);
                return;
            }
            const stream = ytdl(song.url, { filter: 'audioonly' });

            try {
                songQueue.connection.play(stream, { seek: 0, volume: 0.5 })
                    .on('finish', () => {
                        songQueue.songs.shift();
                        videoPlayer(guild, songQueue.songs[0]);
                    })
                    //res.json({ r: "now playing ' + song.title + '", error: null })
            } catch (err) {
                console.log("vc join err: " + err)
                res.json({ r: "there has been an error", error: "error cant connet to channel and play song." })
            }

        }

        const skipSong = (serverQueue) => {
            if (!serverQueue) {
                return res.json({ r: "there has been an error", error: "error cant skip there are no songs queued for that channel. have to selected the wrong one?" })
            }
            serverQueue.connection.dispatcher.end();
            res.json({ r: "the song has been skiped", error: null })
        }


        if (urlObj.query.skip) {
            skipSong(serverQueue)

        } else if (urlObj.query.song) {
            let song = {};

            const videoFinder = async(query) => {
                const videoResult = await ytSearch(query);
                return (videoResult.videos.length > 1) ? videoResult.videos[0] : null;
            }

            const video = await videoFinder(urlObj.query.song);

            if (video) {
                song = { title: video.title, url: video.url }
            } else {
                console.log("no vid")
                res.json({ r: "there has been an error", error: "song cant be found try adding more key words or use the url" })
            }
            if (!serverQueue) {
                const queueConstructor = {
                    voiceChannel: client.guilds.cache.get(urlObj.query.serverid).channels.cache.get(urlObj.query.channelid),
                    connection: null,
                    songs: []
                }
                queue.set(urlObj.query.serverid, queueConstructor);
                queueConstructor.songs.push(song);

                try {
                    const connection = await client.guilds.cache.get(urlObj.query.serverid).channels.cache.get(urlObj.query.channelid).join();

                    queueConstructor.connection = connection;

                    videoPlayer(urlObj.query.serverid, queueConstructor.songs[0]);

                } catch (err) {
                    queue.delete(urlObj.query.serverid);
                    res.json({ r: "there has been an error", error: "error cant connet to channel and play song." })
                    console.log("song error")
                }
            } else {
                serverQueue.songs.push(song);
            }

        }
    } else {
        res.json({ r: "there has been an error", error: "error you cant play songs in servers you are not in." })
        console.log("not in guild")
    }


})

app.get('*', function(req, res) {
    res.status(404).send('what??? ' + `"${req.url}"` + " is not a thing  ");
});
app.post('*', function(req, res) {
    res.status(404).send("what??? you cant post to '" + req.url + "'.");
});




client.once('ready', () => {
    console.log(`${client.user.tag}` + " is online")
    console.log("made by: 404invalid-user (http://invaliduser.uk.to)")
});


client.login(conf.token)
app.listen(conf.port || 6969, () => console.log('listening on port ' + conf.port + ' or 6969'));