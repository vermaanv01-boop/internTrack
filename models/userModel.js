const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name:{"type":String , required:[true, "Please provide name"], trim:true},
    email:{"type":String , required:[true, "Please provide email"], unique:true, trim:true, lowercase:true},
    password:{"type":String , required :[true,"Please provide password"]},
    timestamp:{"type":Date , default:Date.now}


})
module.exports = mongoose.model("User", userSchema);