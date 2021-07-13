'use strict';

const AWS = require('aws-sdk');
const dynamo = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME;

module.exports.handler = async (event = {}) => {
  console.log('Event: ', JSON.stringify(event, null, 2));

  try {
    const { pathParameters = {} } = event;
    const { trip_id } = pathParameters;
    const trip = await fetchTrip(trip_id);
    const members = await fetchSimilarTrips(trip);
    const reccomended = await fetchReccomendedHousing(trip);

    const [city, country] = trip.location.split(',');
    trip.location = `${city.charAt(0).toUpperCase() + city.slice(1)}, ${
      country.charAt(0).toUpperCase() + country.slice(1)
    }`;

    return {
      statusCode: 200,
      body: JSON.stringify({ succes: true, result: { trip, members, reccomended } }, null, 2),
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

const fetchTrip = async trip_id => {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: {
      '#pk': 'pk',
    },
    ExpressionAttributeValues: {
      ':pk': `TRIP#${trip_id}`,
    },
  };

  const { Items = [] } = await dynamo.query(params).promise();
  if (Items.length === 0) throw { status: 404, message: `Trip not found for id: ${trip_id}` };

  console.log('Items: ', JSON.stringify(Items, null, 2));
  const trip = Items.filter(i => i.metadata)
    .map(i => i.metadata)
    .pop();

  const user = Items.find(i => i.sk.startsWith('USER#'));
  trip.user_id = user.sk.split('#').pop();
  return trip;
};

const fetchSimilarTrips = async (trip = {}) => {
  const { start, end, location } = trip;

  const durationMillis = new Date(end).getTime() - new Date(start).getTime();
  console.log(durationMillis);
  const durationDays = (durationMillis / 1000 / 60 / 60 / 24);

  const promises = [];
  for (let i = 0; i < durationDays; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const params = {
      TableName: TABLE_NAME,
      IndexName: 'sk-data-index',
      KeyConditionExpression: '#sk = :sk AND begins_with(#data, :data)',
      ExpressionAttributeNames: {
        '#sk': `sk`,
        '#data': 'data',
      },
      ExpressionAttributeValues: {
        ':sk': `TRIP#${location}#${date.toISOString()}`,
        ':data': `TRIP#OPEN#`,
      },
    };

    console.log('Params: ', JSON.stringify(params));
    promises.push(dynamo.query(params).promise());
  }

  const results = await Promise.all(promises);
  console.log('Results: ', JSON.stringify(results, null, 2));
  const users = results.filter(r => r.Items.length > 0).flatMap(r => r.Items);

  const overlappingTrips = users.filter(u => {
    const [, , trip_user_id] = u.data.split('#');
    return trip_user_id !== trip.user_id;
  });

  const members = await fetchMembers(
    overlappingTrips.map(u => {
      const [, , trip_user_id] = u.data.split('#');
      return trip_user_id;
    })
  );

  for (const member of members) {
    console.log('Check Member: ', member.id);
    const overlappingDays = overlappingTrips.filter(d => d.data === `TRIP#OPEN#${member.id}`);
    if (overlappingDays.length > 1) {
      const start = overlappingDays[0].sk.split('#').pop();
      const end = overlappingDays[overlappingDays.length - 1].sk.split('#').pop();

      const startDate = new Date(start);
      const endDate = new Date(end);
      member.overlap = `${startDate.toDateString()} - ${endDate.toDateString()}`;
    } else {
      member.overlap = overlappingDays[0].sk.split('#').pop();
    }
  }
  return members;
};

const fetchReccomendedHousing = async (trip = {}) => {
  const { location } = trip;

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'sk-data-index',
    KeyConditionExpression: '#sk = :sk AND begins_with(#data, :data)',
    ExpressionAttributeNames: {
      '#sk': `sk`,
      '#data': 'data',
    },
    ExpressionAttributeValues: {
      ':sk': `LOCATION#${location}`,
      ':data': `RECCOMENDATION#OPEN#`,
    },
  };

  console.log('Params: ', JSON.stringify(params));
  const { Items = [] } = await dynamo.query(params).promise();
  return Items.map(i => i.metadata);
};

const fetchMembers = async (member_ids = []) => {
  if (member_ids.length === 0) return [];
  member_ids = [...new Set(member_ids)];
  const classKeys = member_ids.map(id => ({ pk: `USER#${id}`, sk: `USER#${id}` }));
  const params = {
    RequestItems: {
      [TABLE_NAME]: {
        Keys: classKeys,
      },
    },
  };

  const { Responses = {} } = await dynamo.batchGet(params).promise();
  const { [TABLE_NAME]: items = [] } = Responses;

  return items.map(i => ({ ...i.metadata, id: i.pk.split('#').pop() }));
};
