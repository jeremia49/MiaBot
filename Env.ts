import * as dotenv from 'dotenv';

dotenv.config();

export default {
    fileAuth: process.env.FILEAUTH ?? 'auth_info_multi.json',
    authorizedUsers: process.env.AUTHORIZED_USERS ?? '[]',
    prefixCommand : process.env.PREFIX_COMMAND ?? "#",
}
   