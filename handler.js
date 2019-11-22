'use strict';

//Call Libraries
const AWS = require('aws-sdk');
const uuid = require('uuid');
const axios = require('axios')
const gunzip = require('gunzip-file')
const xml2js = require('xml2js');

const fs = require('fs');


//Define the XML parser
var parser = new xml2js.Parser({ignoreAttrs : false, mergeAttrs : true, explicitArray : false});

//Define AWS resources objects
var s3 = new AWS.S3()
var glue = new AWS.Glue();

//Lambda handler for the S3 File Processing
module.exports.s3fileparser = (event, context, callback) => {

  let myProm = new Promise(async function(resolve, reject){

    console.log("Event==>" + JSON.stringify(event))

    var id = uuid.v1();//Create Unique ID

    //Get S3 information     
    var s3bucket = event.Records[0].s3.bucket.name;
    var s3filekey = event.Records[0].s3.object.key;
    var s3filename = s3filekey.split("/");
    s3filename = s3filename.pop();

    var s3params = { Bucket: s3bucket, Key: s3filekey };//Set S3 Parameters

    //Set the Headers for REST API Request
    var headersdata = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-User-Email': process.env.ZAURU_HEADER_USER_EMAIL,
            'X-User-Token': process.env.ZAURU_HEADER_USER_TOKEN
          };

    //Finally get the HEAD for the s3Object
    var head = await s3.headObject(s3params).promise();
    
    if(head && head.Metadata)
    {
      let file_public_url = "https://" + s3bucket + ".s3.amazonaws.com/" + s3filekey;
      let usertoken = ((head.Metadata.token) ? head.Metadata.token : "");
      let user = ((head.Metadata.user) ? head.Metadata.user : "");
      let entity = ((head.Metadata.entity) ? head.Metadata.entity : "")
      
      ///////
      // XML file
      ///////
      if(s3filename.search("xml.gz") > -1)
      {
        //console.log(head);
        let filename =  s3filename.replace(".xml.gz", "")
        let xmlfilename = filename + '.xml';
        let jsonfilename = filename + '.json';

        //POSTING DATA to ZAURU
        var postdata = {
            "data_import_job": 
              {
                "data_type": "invoices_with_payments", 
                "original_file_url": file_public_url, 
                "token": usertoken, 
                "email": user, 
                "uuid": id,
                "entity": entity,
                "status": "original file received", 
                "source": "xml->json lambda",
                "percentage_completed": "10"
              }
          };

        var options = {
          method: 'POST',
          headers: headersdata,
          data: postdata,
          url: process.env.ZAURU_POST_URL
        };

        console.log("Post Options==>" + JSON.stringify( options ))

        //Calling POST API
        axios(options)
        .then(function (response) {//If successful api
           
          //GetObject FILE FROM S3 buckets
          let file = fs.createWriteStream("/tmp/"+ s3filename);
          s3.getObject(s3params).createReadStream().pipe(file);

          //S3 Operation Success Callback
          file.on('close', async function(){

            console.log('s3 file read done and downloaded ==' + "/tmp/"+s3filename);

            //GUNZIPPING the FILE
            gunzip("/tmp/"+s3filename, "/tmp/"+ xmlfilename, () => {

              console.log('gunzip done!')

              //XML To JSON
              fs.readFile("/tmp/"+ xmlfilename, function(err, data) {

                  parser.parseString(data, function (err, result) {
                      console.log("Parsing Done!");

                      //Upload the File to S3 Destination Buckets
                      s3.putObject({ Bucket: process.env.AWS_S3_BUCKET_DESTINATION, 
                          Key: "json/"+jsonfilename, Body: JSON.stringify(result) }, function(err, data) {

                          console.log('uploaded json file');

                          //Trigger AWS Glue Job
                          glue.startJobRun({ JobName: process.env.AWS_GLUE_JOB_NAME }, async function(err, data) {
                            if (err) console.log(err, err.stack); // an error occurred
                            else
                            {
                              console.log(data);           // successful response  
                              
                              postdata = {
                                "external_id" : data.JobRunId,
                                "source": "Lambda for moving files", 
                                "status": "finished moving files, triggering glue job", 
                                "percentage_completed": "30"
                              };

                              options.data = postdata;
                              options.url = process.env.ZAURU_PUT_URL + id + ".json";
                              options.method = "PUT"

                              //Call PUT APIs
                              await axios(options)
                              .then(function (response) {
                                console.log("PUT API Success SUCCESS==")
                                callback(null, "Successfully Done!")
                              })
                              .catch(function (error) {
                                console.log(error);
                                callback(null, "Error")
                              });
                            }

                          });

                      });

                  });
              });

            });//End Gunzip

          })

          file.on('error', function(err) {//If Error
            console.log(err);
            callback(null, "Error")
          });
           

        })
        .catch(function (error) {//If Error
          console.log(error);
          callback(null, "Error")
        }); 

      }

      ////////
      //CSV File Processing
      ////////

      else if(s3filename.search(".txt") > -1)
      {
        //POSTING DATA to ZAURU
        var postdata = {
            "data_import_job": 
              {
                "data_type": "purchase_orders", 
                "original_file_url": file_public_url, 
                "token": usertoken, 
                "email": user, 
                "uuid": id, 
                "entity": entity,
                "status": "original file received", 
                "source": "csv->json lambda",
                "percentage_completed": "10"
              }
          };

        var options = {
          method: 'POST',
          headers: headersdata,
          data: postdata,
          url: process.env.ZAURU_POST_URL
        };

        //Calling POST API
        axios(options).then(function (response) {//If successful api

          console.log("1.POST API SUCCESS==")
           
          //READ FILE FROM S3
          let file = fs.createWriteStream("/tmp/"+ s3filename);
          s3.getObject(s3params).createReadStream().pipe(file);

          //Callback for S3 Success Operation
          file.on('close', async function(){

            console.log('s3 file read done and downloaded ==' + "/tmp/"+s3filename);

              //Read Downloaded File and Upload to S3 Destination bucket
              fs.readFile("/tmp/"+ s3filename, function(err, data) {

                      s3.putObject({ Bucket: process.env.AWS_S3_BUCKET_DESTINATION, 
                          Key: s3filekey, Body: data }, function(err, data) {
                          console.log('uploaded json file') // File uploads incorrectly.

                          //Trigger AWS Glue Job
                          glue.startJobRun({ JobName: process.env.AWS_GLUE_JOB_NAME }, async function(err, data) {
                            if (err) console.log(err, err.stack); // an error occurred
                            else
                            {
                              console.log(data);           // successful response  
                              //Call PUT api
                              postdata = {
                                "external_id": data.JobRunId,
                                "source": "Lambda for moving files", 
                                "status": "finished moving files, triggering glue job", 
                                "percentage_completed": "30"
                              };

                              options.data = postdata;
                              options.url = process.env.ZAURU_PUT_URL + id + ".json";
                              options.method = "PUT";

                              //Call PUT API
                              await axios(options)
                              .then(function (response) {

                                console.log("PUT API Success SUCCESS==")
                                callback(null, "Successfully Done!")
                              })
                              .catch(function (error) { //If error
                                console.log(error);
                                callback(null, "Error")
                              });
                            }

                          });

                      });

              });

          })

          file.on('error', function(err) {//If error
            console.log(err);
            callback(null, "Error")
          });
           

        })
        .catch(function (error) {//If error
          console.log(error);
          callback(null, "Error")
        });
      }

    }//End of If Conditon of Head metadata
    else{
      callback(null, "No Metadata found")
    }

  });
};

