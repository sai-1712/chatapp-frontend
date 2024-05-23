import { FormControl } from "@chakra-ui/form-control";
import { Input } from "@chakra-ui/input";
import { Box, Text } from "@chakra-ui/layout";
import "./styles.css";
import { IconButton, Spinner, useToast } from "@chakra-ui/react";
import { getSender, getSenderFull } from "../config/ChatLogics";
import { useEffect, useState } from "react";
import axios from "axios";
import { ArrowBackIcon } from "@chakra-ui/icons";
import ProfileModal from "./miscellaneous/ProfileModal";
import ScrollableChat from "./ScrollableChat";
import Lottie from "react-lottie";
import animationData from "../animations/typing.json";

import io from "socket.io-client";
import UpdateGroupChatModal from "./miscellaneous/UpdateGroupChatModal";
import { ChatState } from "../Context/ChatProvider";
import { connect, StringCodec } from "nats.ws";

const ENDPOINT = "http://localhost:5000";
var socket, selectedChatCompare;

const SingleChat = ({ fetchAgain, setFetchAgain }) => {
  const [messages, setMessages] = useState([]);
  const [subscribedChats, setSubscribedChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [typing, setTyping] = useState(false);
  const [istyping, setIsTyping] = useState(false);
  const toast = useToast();
  
  const defaultOptions = {
    loop: true,
    autoplay: true,
    animationData: animationData,
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };
  const { selectedChat, setSelectedChat, user, notification, setNotification } = ChatState();
  const fetchMessages = async () => {
    if (!selectedChat) return;

    try {
      const config = {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      };

      setLoading(true);

      const { data } = await axios.get(
        `/api/message/${selectedChat._id}`,
        config
      );
      const transformedData = data.map(({ content, sender }) => ({
        content,
        chatId : selectedChat,
        sender: {
          name: sender.name,
          pic: sender.pic,
          _id: sender._id,
        }
      }));
      setMessages(transformedData);
      setLoading(false);
      
      // call subscription function here
      // socket.emit("join chat", selectedChat._id);
    } catch (error) {
      toast({
        title: "Error Occured!",
        description: "Failed to Load the Messages",
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom",
      });
    }
  };

  const sendMessage = async (event) => {
    if (event.key === "Enter" && newMessage) {
      // socket.emit("stop typing", selectedChat._id);
      try {
        setNewMessage("");
        // const config = {
        //   headers: {
        //     "Content-type": "application/json",
        //     Authorization: `Bearer ${user.token}`,
        //   },
        // };
        // const { data } = await axios.post(
        //   "/api/message",
        //   {
        //     content: newMessage,
        //     chatId: selectedChat,
        //   },
        //   config
        // );
        const natsobj = {
          content : newMessage,
          chatId: selectedChat,
          sender : {
            name: user.name,
            pic: user.pic,
            _id : user._id
          }
        }
        console.log("sent msg: ", natsobj);
        // nats publish here with chat_id as channel name, every user in that chat will receive through subsribe
        connection.publish("sk."+selectedChat._id, JSON.stringify(natsobj));

        setMessages((prev) => {
          return [...prev, natsobj]
        });
      } catch (error) {
        toast({
          title: "Error Occured!",
          description: "Failed to send the Message",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "bottom",
        });
      }
    }
  };

  const subscriber = async (nc, t) => {
    if (nc) {
      if(t && !subscribedChats.includes(t._id)){
        console.log("connected as Subscriber to : ", t._id);
        const sub = nc.subscribe("sk."+ t._id);
        setSubscribedChats((prev) => {
          return [...prev, t._id]
        })
        console.log(sub);
        for await (const m of sub) {
          console.log("mesg obj: ", m);
          const msg = StringCodec().decode(m.data);
          const natsobject = JSON.parse(msg)
          console.log("recieved msg: ", natsobject);
          if(natsobject.sender._id !== user._id){
            console.log("before rec: ", messages);
            // setMessages([...messages, natsobject]);
            setMessages((prev) => {
              return [...prev, natsobject]
            });
          }
          // console.log(`[${sub.getProcessed()}]: ${StringCodec().decode(m.data)}`);
        }

        console.log("subscription closed");
      }
      
    } else {
      console.log("Not connected");
    }
  };

  // useEffect(() => {
  //   socket = io(ENDPOINT);
  //   socket.emit("setup", user);
  //   socket.on("connected", () => setSocketConnected(true));
  //   socket.on("typing", () => setIsTyping(true));
  //   socket.on("stop typing", () => setIsTyping(false));

  //   // eslint-disable-next-line
  // }, []);

  useEffect(() => {
    fetchMessages();
    console.log("sc: ", selectedChat);
    subscriber(connection, selectedChat)
    selectedChatCompare = selectedChat;
    // eslint-disable-next-line
  }, [selectedChat]);

  // useEffect(() => {
  //   // this is subscription function, nats subscribe here for this selected chat id
  //   // subscriber(connection, selectedChat)
  //   socket.on("message recieved", (newMessageRecieved) => {
  //     if (
  //       !selectedChatCompare || // if chat is not selected or doesn't match current chat
  //       selectedChatCompare._id !== newMessageRecieved.chat._id
  //     ) {
  //       // to send notification
  //       if (!notification.includes(newMessageRecieved)) {
  //         setNotification([newMessageRecieved, ...notification]);
  //         setFetchAgain(!fetchAgain);
  //       }
  //     } else {
  //       // to set message in chat box
  //       setMessages([...messages, newMessageRecieved]);
  //     }
  //   });
  // });

  const typingHandler = (e) => {
    setNewMessage(e.target.value);

    if (!socketConnected) return;

    if (!typing) {
      setTyping(true);
      socket.emit("typing", selectedChat._id);
    }
    let lastTypingTime = new Date().getTime();
    var timerLength = 3000;
    setTimeout(() => {
      var timeNow = new Date().getTime();
      var timeDiff = timeNow - lastTypingTime;
      if (timeDiff >= timerLength && typing) {
        socket.emit("stop typing", selectedChat._id);
        setTyping(false);
      }
    }, timerLength);
  };

  // NATS Config
  const [connection, setConnection] = useState(undefined);
  useEffect(() => {
    if (connection === undefined) {
      const connectToNats = async () => {
        try {
          const natsConnection = await connect({
            servers: "ws://localhost:5050",
          });
          setConnection(natsConnection);
          console.log(natsConnection);
        } catch (err) {
          console.log("Error connecting");
          console.error(err);
        }
      };
      connectToNats();
    }
  }, [connection]);

  return (
    <>
      {selectedChat ? (
        <>
          <Text
            fontSize={{ base: "28px", md: "30px" }}
            pb={3}
            px={2}
            w="100%"
            fontFamily="Work sans"
            d="flex"
            justifyContent={{ base: "space-between" }}
            alignItems="center"
          >
            <IconButton
              d={{ base: "flex", md: "none" }}
              icon={<ArrowBackIcon />}
              onClick={() => setSelectedChat("")}
            />
            {messages &&
              (!selectedChat.isGroupChat ? (
                <>
                  {getSender(user, selectedChat.users)}
                  <ProfileModal
                    user={getSenderFull(user, selectedChat.users)}
                  />
                </>
              ) : (
                <>
                  {selectedChat.chatName.toUpperCase()}
                  <UpdateGroupChatModal
                    fetchMessages={fetchMessages}
                    fetchAgain={fetchAgain}
                    setFetchAgain={setFetchAgain}
                  />
                </>
              ))}
          </Text>
          <Box
            d="flex"
            flexDir="column"
            justifyContent="flex-end"
            p={3}
            bg="#E8E8E8"
            w="100%"
            h="100%"
            borderRadius="lg"
            overflowY="hidden"
          >
            {loading ? (
              <Spinner
                size="xl"
                w={20}
                h={20}
                alignSelf="center"
                margin="auto"
              />
            ) : (
              <div className="messages">
                <ScrollableChat messages={messages} />
              </div>
            )}

            <FormControl
              onKeyDown={sendMessage}
              id="first-name"
              isRequired
              mt={3}
            >
              {istyping ? (
                <div>
                  <Lottie
                    options={defaultOptions}
                    // height={50}
                    width={70}
                    style={{ marginBottom: 15, marginLeft: 0 }}
                  />
                </div>
              ) : (
                <></>
              )}
              <Input
                variant="filled"
                bg="#E0E0E0"
                placeholder="Enter a message.."
                value={newMessage}
                onChange={typingHandler}
              />
            </FormControl>
          </Box>
        </>
      ) : (
        // to get socket.io on same page
        <Box display="flex" alignItems="center" justifyContent="center" h="100%">
          <Text fontSize="3xl" pb={3} fontFamily="Work sans">
            Click on a user to start chatting
          </Text>
        </Box>
      )}
    </>
  );
};

export default SingleChat;
