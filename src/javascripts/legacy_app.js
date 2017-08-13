import BaseApp from "base_app";
import csvParser from "csv-js"
// add these if needed
// import Base64 from 'base64';
// import helpers from 'helpers';
csvParser.RELAXED = true;
var App = {
    defaultState: "layout",

    // global vars
    parsedCSV: null,
    subject: null,
    description: null,
    requesterEmail: null,
    requesterName: null,
    productArea: null,
    requesterID: null,
    errorTicketCreate: null,
    counter: null,
    promises: null,

    events: {
        'change #selDepartment': 'changeTemplate',
        'click #createTickets': 'getCSVFile',
        'getCSV.fail': 'errorGettingCSV',
        'getCSV.done': 'parseCSV',
        'searchRequester.done': 'makeRequester'
    }, //end of events

    changeTemplate: function() {
        this.$('div.progress > div.progress-bar').css({ "width": "0%" });
        var selection = this.$("#selDepartment").val();
        if (selection === "tier1") {
            this.switchTo('tier1');
        } else if (selection === "tier2") {
            this.switchTo('tier2');
        } else {
            this.switchTo('empty');
        }
    },
    getCSVFile: function() {
        this.requesterName = this.$("#inputName").val(); //setting requester name from input field
        this.requesterEmail = this.$("#inputEmail").val(); //setting requester email from input field
        /*Checking if requesterName and requesterEmail was set*/
        if (this.requesterName.length === 0) {
            this.zafClient.invoke('notify', 'Trainer Name is Required!', 'alert', 8000);
            return;
        } else if (this.requesterEmail.length === 0) {
            this.zafClient.invoke('notify', 'Trainer Email is Required!', 'alert', 8000);
            return;
        }
        this.productArea = this.$("#selProductArea option:selected").val(); //setting product area from dropdown
        if (this.productArea === undefined) this.productArea = this.$("#selDepartment option:selected").val();
        this.$('#createTickets').prop('disabled', true);
        this.counter = 0;
        this.$('div.progress > div.progress-bar').css({ "width": "0%" });

        this.ajax('getCSV', this.productArea); //getting CSV file
    }, //end of getCSVFile

    errorGettingCSV: function() {
        this.zafClient.invoke('notify', "Unable to retrieve file!", 'error');
    }, //end of errorGettingCSV

    parseCSV: function(data) {
        this.parsedCSV = csvParser.parse(data); //parse CSV file and set parsedCSV var
        this.ajax('searchRequester', this.requesterEmail); // search if specified requester exits
    }, //end of parseCSV

    makeRequester: function(data) {
        if (data.count !== 0) { // if there was a result from the search
            this.requesterID = data.results[0].id; // set requesterID to by grabbing userID from search result
            this.makeTickets(); // call on function to create tickets
        } else { // if the requester doesn't exist already, create the requester as a new user to avoid 409 errors using the ticket import API
            this.ajax('createRequester', this.requesterName, this.requesterEmail) // creating the requester as a new user
                .done(function(jqXHR) {
                    this.requesterID = jqXHR.user.id; // grabbing the userID of the requester that was created and setting global var
                    this.makeTickets(); // call on fucntion to create tickets
                })
                .fail(function(jqXHR) {
                    /*Upon failure construct an error message with response code and text*/
                    console.log('Error creating user:\n' + jqXHR.status + ' ' + jqXHR.responseText);
                    this.zafClient.invoke('notify', 'Error creating user!', 'error', 8000); // fail error message
                });
        }
    }, //end of makeRequester

    makeTickets: function() {
        this.promises = [];
        this.num = null;
        var that = this; // aliasing this to another var to use inside _.each function
        _.each(this.parsedCSV, function(each, i, l) { //iterate over parsedCSV
            that.num = l.length;
            that.subject = each[0]; //setting subject
            that.description = each[1]; //setting description
            var request = that.ajax('importTicket', that.subject, that.description, that.requesterID) // call to create tickets
                .done(function() {
                    that.counter += 1;
                    var percentComplete = (that.counter / that.num) * 100;
                    console.log('Created a Ticket'); // console logging upon success for debugging
                    that.$('div.progress > div.progress-bar').css({ "width": percentComplete + "%" });
                })
                .fail(function(jqXHR) {
                    console.log('Ticket Creation failed\n' + jqXHR.status + ' ' + jqXHR.responseText); // console logging error for easy debugging
                    that.errorTicketCreate = true;
                    return;
                }); // end of ajax call to create tickets
            that.promises.push(request);
        }); // end of _.each to iterate over parsedCSV
        Promise.all(this.promises).then(function() {
            that.zafClient.invoke('notify', 'Successfully Created Tickets! :)', 'notice', 8000);
            that.$('#createTickets').prop('disabled', false);
        }, function() {
            that.zafClient.invoke('notify', 'Error in Creating tickets :(', 'error', 8000);
            that.$('#createTickets').prop('disabled', false);
        });
    }, //end of makeTickets

    requests: {

        getCSV: function(fileName) {
            return {
                url: 'https://zendesk.box.com/shared/static/' + fileName + '.csv',
                type: 'GET',
                cors: false,
                dataType: 'text',
            };
        }, //end of getCSV

        searchRequester: function(email) {
            return {
                url: '/api/v2/search?query=type%3Auser%20email%3A' + encodeURI(email),
                type: 'GET'
            };
        },

        createRequester: function(name, email) {
            return {
                url: '/api/v2/users.json',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    'user': {
                        'name': name,
                        'email': email
                    }
                })
            };

        }, //end of createRequester

        importTicket: function(subject, description, requester_id) {
            return {
                url: '/api/v2/imports/tickets.json',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    "ticket": {
                        "requester_id": requester_id,
                        "tags": ["zendesk_training_tickets"],
                        "subject": subject,
                        "comment": {
                            "body": description
                        }
                    }
                })
            };
        } //end of importTicket
    } //end of requests
};

export default BaseApp.extend(App);