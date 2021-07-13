'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = process.env.TABLE_NAME;

module.exports.handler = async (event = {}) => {
  console.log('Event: ', JSON.stringify(event, null, 2));

  try {
    const { body = '{}' } = event;
    const request = JSON.parse(body);

    const user = await createUser(request);
    return {
      statusCode: 200,
      body: JSON.stringify({ user }, null, 2),
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ message: err.message || 'An unknown error occured' }, null, 2),
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    };
  }
};

const createUser = async (request = {}) => {
  const user_id = `US${uuidv4()}`;
  const { first_name, last_name, email } = request;

  const metadata = {
    first_name,
    last_name,
    id: user_id,
    email,
  };

  const now = Date.now();
  const params = {
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `USER#${user_id}`,
            sk: `USER#${user_id}`,
            data: `#`,
            metadata,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `USER#${user_id}`,
            sk: 'CREATED',
            data: `USER#OPEN#${new Date(now).toISOString()}`,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            pk: `USER#${user_id}`,
            sk: 'EMAIL',
            data: `USER#${email}#${new Date(now).toISOString()}`,
          },
        },
      },
    ],
  };

  await dynamo.transactWrite(params).promise();

  const user = params.TransactItems.shift().Put.Item;
  return user;
};
