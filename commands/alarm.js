"use strict";

const Alarm_model = require('../models/alarm_model');
const auth = require('./../auth.json');
const time_utils = require('../Utils/time_validation');
const utils = require('../Utils/utility_functions');
const logging = require('../Utils/logging');
const channel_regex = /<#\d+>/;


module.exports = {
    name: 'alarm',
    description: 'Sets up an alarm that will be repeated\n' +
        'This alarm will send a message to the _channel_ of the _server_ in which it is activated. Insert channel as the last parameter if you wish to send the message to a specific channel, otherwise it will send it to the channel you are typing the message on\n',
    usage: auth.prefix + 'alarm <timezone/city/UTC> <m> <h> <day_of_the_month> <month> <weekday> <message> <channel>',
    async execute(msg, args, client, cron, cron_list, mongoose) {
        if (utils.hasAlarmRole(msg, auth.alarm_role_name) || utils.isAdministrator(msg)) {
            if (args.length > 6) {
                var timezone = args[0];
                var crono = args.slice(1, 6).join(' ');
                var message_stg = args.slice(6, args.length).join(' ');
                var difference = time_utils.get_offset_difference(timezone);
                if (difference === undefined) {
                    msg.channel.send('The timezone you have entered is invalid. Please visit https://www.timeanddate.com/time/map/ for information about your timezone!')
                }
                else if (time_utils.validate_alarm_parameters(msg, crono, message_stg)) {
                    var channel = args.pop();
                    var hasSpecifiedChannel = channel_regex.test(channel);
                    let channel_discord = msg.channel;
                    if (hasSpecifiedChannel) {
                        channel_discord = msg.guild.channels.cache.get(channel.replace(/[<>#]/g, ''));
                        message_stg = args.slice(6, args.length).join(' ');
                    }
                    crono = time_utils.updateParams(difference, crono);
                    if (channel_discord !== undefined) {
                        try {
                            let scheduledMessage = new cron(crono, () => {
                                channel_discord.send(`${message_stg}`);
                            }, {
                                scheduled: true
                            });
                            scheduledMessage.start();

                            // generate the id to save in the db
                            let alarm_user = msg.author.id;
                            let this_alarm_id = Math.random().toString(36).substring(4);
                            let alarm_id = `${this_alarm_id}_${alarm_user}`;
                            // save locally
                            cron_list[alarm_id] = scheduledMessage;

                            // save to DB
                            const newAlarm = new Alarm_model({
                                _id: mongoose.Types.ObjectId(),
                                alarm_id: alarm_id,
                                alarm_args: crono,
                                message: message_stg,
                                guild: msg.guild.id,
                                channel: channel_discord.id,
                                isActive: true,
                                timestamp: Date.now(),
                            });
                            newAlarm.save()
                                .then((result) => {
                                    logging.logger.info(`${result} added to database`);
                                    msg.channel.send({
                                        embed: {
                                            fields: { name: `Alarm with id: ${alarm_id} added!`, value: `Alarm with params: ${crono} (server time) and message ${message_stg} for channel ${channel_discord.name} was added with success!` },
                                            timestamp: new Date()
                                        }
                                    });
                                })
                                .catch((err) => {
                                    logging.logger.info(`An error while trying to add ${result} to the database. Message: ${newAlarm}`);
                                    logging.logger.error(err);
                                });
                        } catch (err) {
                            logging.logger.info(`An error while trying to add alarm with params: ${msg.content}`);
                            logging.logger.error(err);
                            msg.channel.send(`Error adding the alarm with params: ${crono}, with message ${message_stg}`);
                        }
                    } else {
                        msg.channel.send('It was not possible to utilize the channel to send the message... Please check the setting of the server and if the bot has the necessary permissions!');

                    }
                }
            } else {
                msg.channel.send('Not enough parameters were passed.\n' +
                    'Usage: ' + this.usage
                );
            }
        }
        else {
            msg.channel.send('You do not have permissions to set that alarm! Ask for the admins on your server to give you the `Alarming` role!');
        }
    }
};


