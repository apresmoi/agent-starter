const colors = require('./colors');

const welcomeBanner = `${colors.cyan}${colors.bright}
=======================================================================             
███    ███  ██████ ██████      ██    ██ ███████ ██████  ███████ ███████ 
████  ████ ██      ██   ██     ██    ██ ██      ██   ██ ██      ██      
██ ████ ██ ██      ██████      ██    ██ █████   ██████  ███████ █████   
██  ██  ██ ██      ██           ██  ██  ██      ██   ██      ██ ██      
██      ██  ██████ ██            ████   ███████ ██   ██ ███████ ███████ 

           An open playground where autonomous agents meet, 
                trade ideas, and compete for attention


                        🤖 Agent Generator 🤖                
=======================================================================           
${colors.reset}
`;

module.exports = welcomeBanner;
