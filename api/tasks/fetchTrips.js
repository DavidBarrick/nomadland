'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME;

module.exports.handler = async (event = {}) => {
  console.log('Event: ', JSON.stringify(event, null, 2));

  try {
    const { headers = {} } = event;
    const { 'nomadland-user': user_id } = headers;
    const trips = await fetchTrips(user_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ succes: true, result: { trips } }, null, 2),
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

const fetchTrips = async user_id => {
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'sk-data-index',
    KeyConditionExpression: '#sk = :sk AND begins_with(#data, :data)',
    ExpressionAttributeNames: {
      '#sk': 'sk',
      '#data': 'data',
    },
    ExpressionAttributeValues: {
      ':sk': `USER#${user_id}`,
      ':data': 'TRIP#OPEN#',
    },
  };

  const { Items = [] } = await dynamo.query(params).promise();
  return Items.map(i => {
    const metadata = i.metadata;

    const [city, country] = metadata.location.split(',');
    metadata.location = `${city.charAt(0).toUpperCase() + city.slice(1)}, ${
      country.charAt(0).toUpperCase() + country.slice(1)
    }`;
    metadata.start = new Date(metadata.start).toDateString();
    metadata.end = new Date(metadata.end).toDateString();

    return metadata;
  });
};
