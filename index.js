const { Client, Intents,Collection } = require('discord.js');
const Discord = require('discord.js');
const fs = require('fs')
const config = require("./assets/config.json")
const ignoreList = require('./assets/ignoreList.json')
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] }); 
const request = require('request');
const entities = require('entities');
const validUrl = require('valid-url');
const { title } = require('process');
let blackListUsers = ignoreList.blackList || [];
const eventFiles = fs.readdirSync('./assets/events').filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const event = require(`./assets/events/${file}`);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args, client));
	} else {
		client.on(event.name, (...args) => event.execute(...args, client));
	}
}

client.login(config.token)

/*
Functions
*/

let clientReady = false;
let lastTimestamp = Math.floor(Date.now() / 1000);
let lastTimestampForThread = Math.floor(Date.now() / 1000);

let server;
let commentChannel;
client.on('ready', () => {
  server = client.guilds.cache.get(config.serverID);
  if (server) {
    commentChannel = server.channels.cache.get(config.commentLogChannelID);
    threadChannel = server.channels.cache.get(config.threadLogChannelID)
  }

  if (!commentChannel && !threadChannel) {
    console.log('A matching channel could not be found. Please check your config.json!');
    process.exit(1);
  } else {
    console.log('Ready for requests!');
    clientReady = true;
  }
});

client.on('error', (error) => {
  console.log('Connection error', error);
  clientReady = false;
});

client.on('shardReconnecting', id => {
  console.log('Reconnecting');
});


//Comment Section
const subredditUrlForComment = `https://www.reddit.com/r/${config.subredditName}/comments.json?sort=new`;
setInterval(() => {
  if (clientReady) {
    request({
      url: subredditUrlForComment,
      json: true,
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        for (const post of body.data.children.reverse()) {
          if (lastTimestamp <= post.data.created_utc) {
            lastTimestamp = post.data.created_utc;
            const embed = new Discord.MessageEmbed();
            embed.setColor(config.embedColor || '#000000');
            embed.setDescription(post.data.body);
            embed.setURL(`https://reddit.com${post.data.permalink}`);
            embed.setTitle(`New comment on /r/${config.subredditName}!`);
            embed.setImage(validUrl.isUri(post.data.thumbnail) ? entities.decodeHTML(post.data.thumbnail) : null);
            embed.setFooter(`by ${post.data.author}`);
            embed.setTimestamp(new Date(post.data.created_utc * 1000));
            if (blackListUsers.some(g => g.includes(post.data.author))) {
              console.log("Blacklisted user's comment denied!")
            }
            else {
            commentChannel.send({ embeds: [embed] }).then(() => {
              console.log(`[Log] Sending message for the new comment - reddit.com${post.data.permalink}`); 
            }).catch(err => {
              console.log(embed, err);
            });
          }
        }
      }
        ++lastTimestamp;
      } else {
        console.log(response, body);
        console.log('[Error] Request failed. Reddit could be down or subreddit doesn\'t exist. Will continue...');
      }
    });
  }
}, config.commentCheckDelay * 1000);


//Thread Section
const subredditUrlForThread = `https://www.reddit.com/r/${config.subredditName}/new.json?limit=10`;
setInterval(() => {
    request({
      url: subredditUrlForThread,
      json: true,
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        for (const post of body.data.children.reverse()) {
          if (lastTimestampForThread <= post.data.created_utc) {
            lastTimestampForThread = post.data.created_utc;
            const embed = new Discord.MessageEmbed();
            embed.setColor(config.embedColor || '#000000');
            let ttitle = post.data.link_flair_text ? `[${post.data.link_flair_text}] ` : '' + entities.decodeHTML(post.data.title)
            if(ttitle.split(' ') > 20) {
              embed.setTitle(ttitle.split(' ').slice(0,20).join(' ') + '...');
            } else {
              embed.setTitle(ttitle)
            }
            embed.setURL(`https://redd.it/${post.data.id}`);
            embed.setDescription(`${post.data.is_self ? entities.decodeHTML(post.data.selftext.length > 253 ? post.data.selftext.slice(0, 253).concat('...') : post.data.selftext) : ''}`);
            embed.setImage(validUrl.isUri(post.data.thumbnail) ? entities.decodeHTML(post.data.thumbnail) : null);
            embed.setFooter(`by ${post.data.author}`);
            embed.setTimestamp(new Date(post.data.created_utc * 1000));
            if (blackListUsers.some(g => g.includes(post.data.author))) {
              console.log("Blacklisted user's thread denied!")
            }
            else {
            threadChannel.send({ embeds: [embed] }).then(() => {
              console.log(`[Log] Sending message for new post - redd.it/${post.data.id}`);
            }).catch(err => {
              console.log(embed, err);
            });
          }
        }
        }
        ++lastTimestampForThread;
      } else {
        console.log(response, body);
        console.log('[Error] Request failed. Reddit could be down or subreddit doesn\'t exist. Will continue...');
      }
    });
}, config.threadCheckDelay * 1000); 


client.on("message", async message => {
  if (message.author.bot || !message.guild || !message.content.toLowerCase().startsWith(config.prefix)) return;
  if (message.author.id !== config.botOwner) return;
  let args = message.content.split(' ').slice(1);
  let command = message.content.split(' ')[0].slice(config.prefix.length);
  let embed = new Discord.MessageEmbed().setColor("#000000").setAuthor(message.member.displayName, message.author.avatarURL({ dynamic: true, })).setFooter(config.ignoreCommandFooter).setTimestamp();
  let target = args[0]

  if(command === "ignore") {

    embed.setDescription(`You must specify a name to add/remove from the blacklist!`);
    embed.addField("Black List", blackListUsers.length > 0 ? blackListUsers.map(g => g).join('\n') : "Doesn't Exist Anything!")
    if (!target) return message.channel.send({ embeds: [embed] })
    console.log(target)
    if (blackListUsers.some(g => g.includes(target))) {
      blackListUsers = blackListUsers.filter(g => !g.includes(target));
      ignoreList.blackList = blackListUsers;
      fs.writeFile("./assets/ignoreList.json", JSON.stringify(ignoreList), (err) => {
        if (err) console.log(err);
      });
      embed.setDescription(`${target}, removed from blacklist by ${message.author}!`);
      message.channel.send({ embeds: [embed] })
    } else {
      list = []
      list = ignoreList
      list.blackList.push(target);
      fs.writeFile("./assets/ignoreList.json", JSON.stringify(list), (err) => {
        if (err) console.log(err);
      });
      embed.setDescription(`${target}, added to the blacklist by ${message.author}!`);
      message.channel.send({ embeds: [embed] })
    };
  };
});