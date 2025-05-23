const inquirer = require('inquirer');

const getRoomDetails = async () => {
  const { roomName, roomDescription } = await inquirer.prompt([
    {
      type: 'input',
      name: 'roomName',
      message: 'What would you like to name your room?',
      default: 'Sitcom Room',
      validate: (input) => (input.trim().length > 0 ? true : 'Room name cannot be empty'),
    },
    {
      type: 'input',
      name: 'roomDescription',
      message: 'Briefly describe your room:',
      default: 'A fun space for our sitcom team to interact',
      validate: (input) => (input.trim().length > 0 ? true : 'Room description cannot be empty'),
    },
  ]);

  return { roomName, roomDescription };
};

module.exports = {
  getRoomDetails,
};
