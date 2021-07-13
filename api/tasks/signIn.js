'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME;

module.exports.handler = async (event = {}) => {
  console.log('Event: ', JSON.stringify(event, null, 2));

  try {
    const { body = '{}' } = event;
    const request = JSON.parse(body);

    const user_id = await signIn(request);
    return {
      statusCode: 200,
      body: JSON.stringify({ result: { user_id } }, null, 2),
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

const signIn = async (request = {}) => {
  const { email } = request;
  if (!email) {
    throw { status: 400, message: 'Email required' };
  }

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'sk-data-index',
    KeyConditionExpression: '#sk = :sk AND #data = :data',
    ExpressionAttributeNames: {
      '#sk': 'sk',
      '#data': 'data',
    },
    ExpressionAttributeValues: {
      ':sk': 'EMAIL',
      ':data': `USER#${email.toLowerCase().trim()}`,
    },
    Limit: 1,
  };

  const { Items = [] } = await dynamo.query(params).promise();
  if (Items.length === 0) {
    throw { status: 404, message: `User not found` };
  }

  const user = Items.pop();
  return user.pk.split('#').pop();
};
