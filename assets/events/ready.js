module.exports = {
	name: 'ready',
	once: true,
	execute(client) {
		const config = require("../config.json") 

		
		console.log(`- Logged as ${client.user.tag} -`);
	},
};